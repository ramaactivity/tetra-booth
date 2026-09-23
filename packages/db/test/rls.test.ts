import { readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Uji migrasi + RLS di Postgres sementara (tanpa Docker), dengan shim `auth.uid()` ala Supabase.
 * Menjaga CLAUDE.md aturan 3: organization_id + RLS di semua tabel.
 */
const SUPABASE_DIR = join(__dirname, "../../../supabase");
const OWNER_EMAIL = "tetraphotobooth@gmail.com";

const pg = new EmbeddedPostgres({
  databaseDir: join(tmpdir(), `tetra-rls-${process.pid}`),
  user: "postgres",
  password: "pw",
  port: 54390 + (process.pid % 100),
  persistent: false,
});
let c: Client;
let org: string;
let owner: string;
let other: string;

const as = async (userId: string | null) => {
  await c.query("reset role");
  if (userId === null) await c.query("set role anon");
  else
    await c.query(
      `set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false)`,
    );
};
const count = async (table: string) =>
  (await c.query(`select count(*)::int as n from ${table}`)).rows[0].n as number;

beforeAll(async () => {
  await pg.initialise();
  await pg.start();
  c = pg.getPgClient();
  await c.connect();
  await c.query(`
    create schema auth;
    create table auth.users(id uuid primary key default gen_random_uuid(), email text unique);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin; create role authenticated nologin;`);
  for (const f of readdirSync(join(SUPABASE_DIR, "migrations")).sort()) {
    await c.query(readFileSync(join(SUPABASE_DIR, "migrations", f), "utf8"));
  }
  owner = (await c.query("insert into auth.users(email) values ($1) returning id", [OWNER_EMAIL]))
    .rows[0].id;
  other = (await c.query("insert into auth.users(email) values ('lain@example.com') returning id"))
    .rows[0].id;
  const seed = readFileSync(join(SUPABASE_DIR, "seed.sql"), "utf8");
  await c.query(seed);
  await c.query(seed); // idempotent
  await c.query(`grant usage on schema public to anon, authenticated;
    grant all on all tables in schema public to anon, authenticated;
    grant all on all sequences in schema public to anon, authenticated;`);
  org = (await c.query("select id from organizations where slug = 'tetra'")).rows[0].id;
}, 120_000);

afterAll(async () => {
  await c?.end();
  await pg.stop();
});

describe("migrasi & RLS", () => {
  it("semua tabel public punya RLS aktif", async () => {
    const { rows } = await c.query(
      "select tablename from pg_tables where schemaname = 'public' and not rowsecurity",
    );
    expect(rows).toEqual([]);
  });

  it("seed: organisasi tetra + owner, idempotent", async () => {
    expect(await count("organizations")).toBe(1);
    const { rows } = await c.query("select role from members where user_id = $1", [owner]);
    expect(rows).toEqual([{ role: "owner" }]);
  });

  it("anon: tidak lihat dan tidak bisa tulis", async () => {
    await as(null);
    expect(await count("organizations")).toBe(0);
    await expect(c.query("insert into organizations(name, slug) values ('x','x')")).rejects.toThrow(
      /row-level security/,
    );
  });

  it("owner: lihat organisasinya dan bisa tulis event; updated_at ikut berubah", async () => {
    await as(owner);
    expect(await count("organizations")).toBe(1);
    const ev = (
      await c.query(
        "insert into events(organization_id, name, mode, event_date) values ($1,'Uji','event','2026-10-12') returning id, updated_at",
        [org],
      )
    ).rows[0];
    await new Promise((r) => setTimeout(r, 10));
    const upd = (
      await c.query("update events set name = 'Uji 2' where id = $1 returning updated_at", [ev.id])
    ).rows[0];
    expect(upd.updated_at > ev.updated_at).toBe(true);
  });

  it("bukan anggota: tidak lihat event organisasi lain, insert ditolak", async () => {
    await as(other);
    expect(await count("events")).toBe(0);
    await expect(
      c.query(
        "insert into events(organization_id, name, mode, event_date) values ($1,'Curang','event','2026-01-01')",
        [org],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("crew: baca ya, tulis tidak (update/delete tersaring 0 baris, insert members ditolak)", async () => {
    await c.query("reset role");
    await c.query("insert into members(organization_id, user_id, role) values ($1,$2,'crew')", [
      org,
      other,
    ]);
    await as(other);
    expect(await count("events")).toBe(1);
    expect((await c.query("update events set name = 'crew'")).rowCount).toBe(0);
    expect((await c.query("delete from events")).rowCount).toBe(0);
    await expect(
      c.query("insert into members(organization_id, user_id, role) values ($1,$2,'admin')", [
        org,
        owner,
      ]),
    ).rejects.toThrow(/row-level security/);
  });
});
