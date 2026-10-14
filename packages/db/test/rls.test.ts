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
const OWNER_EMAIL = "tetrabooth.app@gmail.com";

const pg = new EmbeddedPostgres({
  databaseDir: join(tmpdir(), `tetra-rls-${process.pid}`),
  user: "postgres",
  password: "pw",
  port: 54390 + (process.pid % 100),
  persistent: false,
  // Windows memakai encoding lokal (WIN1252) kalau tidak diminta: migrasi berisi "→" gagal dimuat.
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
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

  it("slug event: nama + tanggal, aksen & tahun dobel dibuang, unik global, ikut nama", async () => {
    await c.query("reset role");
    const add = async (name: string) =>
      (
        await c.query(
          "insert into events(organization_id, name, mode, event_date) values ($1,$2,'event','2026-10-04') returning id, slug",
          [org, name],
        )
      ).rows[0] as { id: string; slug: string };
    const evs = [
      await add("Employee Day — DSO"),
      await add("employee day dso"),
      await add("Café Ñandú!"),
      await add("Employee Day DSO 2026"),
    ];
    expect(evs.map((e) => e.slug)).toEqual([
      "employee-day-dso-2026-10-04",
      "employee-day-dso-2026-10-04-2",
      "cafe-nandu-2026-10-04",
      "employee-day-dso-2026-10-04-3",
    ]);
    // Unik global (link publik /g/<slug>): organisasi lain dengan nama sama dapat akhiran.
    const org2 = (
      await c.query("insert into organizations(name, slug) values ('Lain','lain') returning id")
    ).rows[0].id as string;
    const lain = await c.query(
      "insert into events(organization_id, name, mode, event_date) values ($1,'Gala Malam 2025','event','2026-10-04') returning id, slug",
      [org2],
    );
    expect(lain.rows[0].slug).toBe("gala-malam-2025-2026-10-04");
    await c.query("delete from events where id = $1", [lain.rows[0].id]);
    await c.query("delete from organizations where id = $1", [org2]);
    const upd = await c.query("update events set name = 'Gala' where id = $1 returning slug", [
      evs[1]?.id,
    ]);
    expect(upd.rows[0].slug).toBe("gala-2026-10-04");
    await c.query("delete from events where id = any($1)", [evs.map((e) => e.id)]);
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

  it("rate_hit: jendela tetap per key, anon tidak bisa memanggil", async () => {
    await c.query("reset role");
    const hit = async (k: string) =>
      (await c.query("select rate_hit($1, 600, 3) as ok", [k])).rows[0].ok as boolean;
    expect([await hit("pair:1"), await hit("pair:1"), await hit("pair:1")]).toEqual([
      true,
      true,
      true,
    ]);
    expect(await hit("pair:1")).toBe(false);
    expect(await hit("pair:2")).toBe(true);
    await c.query("update rate_limits set window_start = now() - interval '11 minutes'");
    expect(await hit("pair:1")).toBe(true);
    await as(null);
    await expect(c.query("select rate_hit('x', 60, 1)")).rejects.toThrow(/permission denied/);
    expect(await count("rate_limits")).toBe(0);
  });

  it("devices: token_hash & kode pairing aktif unik", async () => {
    await c.query("reset role");
    const add = (code: string | null, hash: string | null, sc: string) =>
      c.query(
        "insert into devices(organization_id, name, short_code, pairing_code, token_hash) values ($1,'b',$2,$3,$4)",
        [org, sc, code, hash],
      );
    await add("123456", "h1", "A1");
    await expect(add("123456", null, "A2")).rejects.toThrow(/devices_pairing_code/);
    await expect(add(null, "h1", "A3")).rejects.toThrow(/devices_token_hash/);
    await add(null, null, "A4");
    await add(null, null, "A5");
  });
  it("guest cam (#197): sesi tamu tanpa device, sesi booth tetap wajib device, kunci tamu unik per event", async () => {
    await c.query("reset role");
    const ev = (
      await c.query(
        "insert into events(organization_id, name, mode, event_date) values ($1,'Guest Cam','event','2026-10-12') returning id",
        [org],
      )
    ).rows[0].id;
    const ins = (id: string, source: string, key: string | null) =>
      c.query(
        "insert into sessions(id, organization_id, event_id, device_id, started_at, source, guest_key_hash) values ($1,$2,$3,null,now(),$4,$5)",
        [id, org, ev, source, key],
      );
    await ins("guest00001", "guest", "k1");
    await expect(ins("booth00001", "booth", null)).rejects.toThrow(/sessions_device_required/);
    await expect(ins("guest00002", "guest", "k1")).rejects.toThrow(/sessions_guest_key/);
    await c.query(
      "insert into assets(organization_id, session_id, kind, r2_key, review_status) values ($1,'guest00001','audio','k/audio_0.webm','pending')",
      [org],
    );
    await expect(
      c.query(
        "insert into assets(organization_id, session_id, kind, r2_key, review_status) values ($1,'guest00001','original','k/o.jpg','x')",
        [org],
      ),
    ).rejects.toThrow(/review_status/);
  });
  it("voucher photobox: RLS, kuota atomik, idempotent per sesi, kedaluwarsa & event", async () => {
    await c.query("reset role");
    const ev = (
      await c.query(
        "insert into events(organization_id, name, mode, event_date) values ($1,'Voucher','photobox','2026-10-14') returning id",
        [org],
      )
    ).rows[0].id as string;
    const dev = (
      await c.query(
        "insert into devices(organization_id, name, short_code) values ($1,'b','V1') returning id",
        [org],
      )
    ).rows[0].id as string;
    // Kolom tambahan opsional: mk("KODE", "ends_at", "now() - interval '1 day'").
    const mk = async (code: string, col = "", val = "") =>
      (
        await c.query(
          `insert into vouchers(organization_id, code, kind, value, max_uses${col && `, ${col}`})
           values ($1,$2,'amount',10000,1${val && `, ${val}`}) returning id`,
          [org, code],
        )
      ).rows[0].id as string;
    const one = await mk("SEKALI");
    const redeem = (voucher: string, session: string, amount = 15000, event = ev) =>
      c.query(
        `select * from redeem_voucher($1,$2,'amount',10000,$3,$4,$5,'strip-3',$6,$7,'fake', now() + interval '5 minutes')`,
        [org, voucher, event, dev, session, amount, 25000 - amount],
      );
    const a = (await redeem(one, "sesi00001")).rows[0];
    expect([a.status, a.amount_idr, a.discount_idr]).toEqual(["pending", 15000, 10000]);
    // Idempotent: sesi yang sama dapat payment yang sama; sesi lain ditolak (kuota 1 terpakai tagihan hidup).
    expect((await redeem(one, "sesi00001")).rows[0].id).toBe(a.id);
    await expect(redeem(one, "sesi00002")).rejects.toThrow(/voucher_used_up/);
    // QR ditinggal sampai kedaluwarsa → kuota kembali.
    await c.query("update payments set expires_at = now() - interval '2 minutes' where id = $1", [
      a.id,
    ]);
    const b = (await redeem(one, "sesi00002", 0)).rows[0];
    expect([b.status, b.amount_idr, b.provider]).toEqual(["paid", 0, "fake"]);
    expect(b.paid_at).not.toBeNull();
    await expect(redeem(one, "sesi00003")).rejects.toThrow(/voucher_used_up/);
    // Dua booth menukar sisa kuota terakhir bersamaan: tepat satu berhasil (baris voucher dikunci).
    const race = await mk("REBUTAN");
    const c2 = pg.getPgClient();
    await c2.connect();
    const sql = `select id from redeem_voucher($1,$2,'amount',10000,$3,$4,$5,'strip-3',0,25000,'voucher',now())`;
    const results = await Promise.allSettled([
      c.query(sql, [org, race, ev, dev, "rebut0001"]),
      c2.query(sql, [org, race, ev, dev, "rebut0002"]),
    ]);
    await c2.end();
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    // Nilai voucher diubah admin di tengah jalan / nonaktif / event lain / di luar tanggal → ditolak.
    await expect(
      c.query(
        `select redeem_voucher($1,$2,'percent',10000,$3,$4,'sesi00009','strip-3',0,0,'fake',now())`,
        [org, b.voucher_id, ev, dev],
      ),
    ).rejects.toThrow(/voucher_invalid/);
    const ev2 = (
      await c.query(
        "insert into events(organization_id, name, mode, event_date) values ($1,'Lain','photobox','2026-10-14') returning id",
        [org],
      )
    ).rows[0].id as string;
    const onlyEv2 = await mk("KHUSUS", "event_id", `'${ev2}'`);
    await expect(redeem(onlyEv2, "sesi00004")).rejects.toThrow(/voucher_invalid/);
    expect((await redeem(onlyEv2, "sesi00004", 15000, ev2)).rows[0].event_id).toBe(ev2);
    const late = await mk("TELAT", "ends_at", "now() - interval '1 day'");
    await expect(redeem(late, "sesi00005")).rejects.toThrow(/voucher_expired/);
    const off = await mk("MATI", "active", "false");
    await expect(redeem(off, "sesi00006")).rejects.toThrow(/voucher_invalid/);
    // Kode hanya huruf besar & angka, unik per organisasi.
    await expect(mk("sekali")).rejects.toThrow(/vouchers_code_check/);
    await expect(mk("SEKALI")).rejects.toThrow(/vouchers_organization_id_code_key/);
    // RLS: crew (other) baca saja; anon tidak lihat & tidak bisa memanggil fungsi.
    await as(other);
    expect(await count("vouchers")).toBeGreaterThan(0);
    expect((await c.query("update vouchers set value = 1")).rowCount).toBe(0);
    await c.query("select set_config('request.jwt.claim.sub', '', false)");
    await as(null);
    expect(await count("vouchers")).toBe(0);
    await expect(redeem(one, "sesi00007")).rejects.toThrow(/permission denied/);
    await c.query("reset role");
  });
});
