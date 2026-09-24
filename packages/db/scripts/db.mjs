// Migrasi, seed, dan generate tipe ke project Supabase lewat SUPABASE_DB_URL (root .env.local).
// Jalankan lewat: pnpm --filter @tetra/db push | seed | types
import { spawn, spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { Client } from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("SUPABASE_DB_URL belum diisi di .env.local root");
const cmd = process.argv[2];
const supabase = (args) =>
  spawnSync("pnpm", ["exec", "supabase", ...args], {
    cwd: "../..",
    stdio: ["inherit", "pipe", "inherit"],
    encoding: "utf8",
  });

if (cmd === "push") {
  const r = supabase(["db", "push", "--db-url", url]);
  process.stdout.write(r.stdout);
  process.exit(r.status ?? 1);
} else if (cmd === "seed") {
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query(readFileSync("../../supabase/seed.sql", "utf8"));
  const { rows } = await c.query(
    "select o.slug, m.role from organizations o left join members m on m.organization_id = o.id",
  );
  console.log("seed OK:", rows);
  await c.end();
} else if (cmd === "types") {
  // Sama seperti `supabase gen types`, tapi tanpa Docker: jalankan pg-meta lokal lalu minta generator TypeScript.
  const port = 8085 + (process.pid % 100);
  const server = spawn(
    process.execPath,
    [createRequire(import.meta.url).resolve("@supabase/postgres-meta/dist/server/server.js")],
    {
      env: {
        ...process.env,
        PG_META_DB_URL: url,
        PG_META_HOST: "127.0.0.1",
        PG_META_PORT: String(port),
      },
      stdio: "ignore",
    },
  );
  try {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (
        await fetch(`http://127.0.0.1:${port}/health`).then(
          (r) => r.ok,
          () => false,
        )
      )
        break;
    }
    const res = await fetch(
      `http://127.0.0.1:${port}/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true`,
    );
    if (!res.ok) throw new Error(`pg-meta ${res.status}: ${await res.text()}`);
    writeFileSync(
      "src/database.types.ts",
      `// Dihasilkan oleh \`pnpm --filter @tetra/db types\`. Jangan edit manual.\n${await res.text()}`,
    );
    console.log("types OK: src/database.types.ts");
  } finally {
    server.kill();
  }
} else if (cmd === "device") {
  // Fase 2 (sebelum admin Fase 3): buat booth baru, atau kode pairing baru untuk booth yang sudah ada.
  const name = process.argv[3];
  if (!name) throw new Error('pakai: pnpm --filter @tetra/db device "<nama booth>"');
  const c = new Client({ connectionString: url });
  await c.connect();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { rows } = await c.query(
    `with org as (select id from organizations where slug = 'tetra'),
     upd as (
       update devices set pairing_code = $2, pairing_expires_at = now() + interval '10 minutes'
       where organization_id = (select id from org) and name = $1 and revoked_at is null
       returning name, short_code
     ),
     ins as (
       insert into devices (organization_id, name, short_code, pairing_code, pairing_expires_at)
       select id, $1, 'B' || lpad((select count(*) + 1 from devices d where d.organization_id = org.id)::text, 2, '0'),
              $2, now() + interval '10 minutes'
       from org where not exists (select 1 from upd)
       returning name, short_code
     )
     select * from upd union all select * from ins`,
    [name, code],
  );
  await c.end();
  console.log(
    `booth ${rows[0].name} (${rows[0].short_code}) · kode pairing ${code} · berlaku 10 menit`,
  );
} else if (cmd === "password") {
  // Atur kata sandi login admin untuk akun yang sudah ada (tanpa email reset). Sandi diketik, tidak lewat argumen.
  const email = process.argv[3];
  if (!email) throw new Error("pakai: pnpm --filter @tetra/db password <email>");
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const pw = await rl.question(`Kata sandi baru untuk ${email} (min 8): `);
  rl.close();
  if (pw.length < 8) throw new Error("kata sandi minimal 8 karakter");
  const c = new Client({ connectionString: url });
  await c.connect();
  const { rowCount } = await c.query(
    "update auth.users set encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() where email = $1",
    [email, pw],
  );
  await c.end();
  console.log(rowCount ? `kata sandi ${email} diperbarui` : `akun ${email} tidak ditemukan`);
} else {
  throw new Error("perintah: push | seed | types | device | password");
}
