// Migrasi, seed, dan generate tipe ke project Supabase lewat SUPABASE_DB_URL (root .env.local).
// Jalankan lewat: pnpm --filter @tetra/db push | seed | types
import { spawn, spawnSync } from "node:child_process";
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
} else {
  throw new Error("perintah: push | seed | types");
}
