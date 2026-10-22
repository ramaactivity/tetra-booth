// Rilis booth (DECISIONS #293): memicu workflow GitHub `booth-installer.yml` — cek kode (Linux) + installer NSIS
// (Windows) bersamaan, lalu job publish meng-upload installer + blockmap + latest.json langsung ke R2. Laptop tidak
// mengunduh/meng-upload apa pun, jadi kecepatan internet lokasi tidak berpengaruh. Ikut di-upload dari sini:
// update.cmd & setup-windows-dev.ps1 (kecil).
// Jalankan: pnpm dist:dev            (rilis versi di apps/booth/package.json; commit harus sudah di-push)
//           pnpm dist:dev --tools    (hanya upload script Windows)
// Butuh R2_* dan NEXT_PUBLIC_MEDIA_URL di apps/web/.env.local.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const need = (k) =>
  process.env[k] ||
  (() => {
    throw new Error(`env ${k} belum diisi`);
  })();
const sh = (cmd, cwd = ".") =>
  execSync(cmd, { cwd, stdio: "inherit", env: { ...process.env, DOTNET_NOLOGO: "1" } });
const crlf = (t) => t.replace(/\r?\n/g, "\r\n"); // cmd.exe & PowerShell 5.1 butuh CRLF
const media = need("NEXT_PUBLIC_MEDIA_URL");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
  },
});
const put = (Key, Body, ContentType) =>
  s3.send(
    new PutObjectCommand({
      Bucket: need("R2_BUCKET"),
      Key,
      Body,
      ContentType,
      CacheControl: "no-cache",
    }),
  );
const tool = (f) =>
  crlf(readFileSync(`tools/windows/${f}`, "utf8").replaceAll("__MEDIA_URL__", media));

if (!process.argv.includes("--tools")) {
  const { version } = JSON.parse(readFileSync("apps/booth/package.json", "utf8"));
  const sha = execSync("git rev-parse HEAD").toString().trim();
  const ref = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
  // Yang ikut ke installer: booth, packages, Camera Service. Perubahan web/dokumen sesi lain di checkout yang sama
  // tidak memblokir rilis booth.
  if (
    execSync(`git status --porcelain --untracked-files=no -- . ":!apps/web" ":!docs" ":!supabase"`)
      .toString()
      .trim()
  )
    throw new Error("ada perubahan booth belum di-commit; commit & push dulu");
  execSync(`git fetch -q origin ${ref}`);
  if (execSync(`git rev-parse origin/${ref}`).toString().trim() !== sha)
    throw new Error(`HEAD belum di-push ke origin/${ref}`);
  const started = Date.now();
  console.log(
    `\n[1/2] Rilis ${version} di GitHub Actions (${ref} ${sha.slice(0, 7)}): cek kode + installer`,
  );
  sh(`gh workflow run booth-installer.yml --ref ${ref}`);
  let run = "";
  for (let i = 0; i < 30 && !run; i++) {
    execSync("sleep 4");
    run = execSync(
      `gh run list --workflow booth-installer.yml --limit 5 --json databaseId,headSha,status -q '[.[] | select(.headSha == "${sha}" and .status != "completed")][0].databaseId // ""'`,
    )
      .toString()
      .trim();
  }
  if (!run) throw new Error("run rilis tidak ditemukan di GitHub Actions");
  sh(`gh run watch ${run} --exit-status --interval 10`);

  console.log("\n[2/2] Cek latest.json di R2");
  const latest = await (
    await fetch(`${media}/dev-builds/latest.json`, { cache: "no-store" })
  ).json();
  if (latest.version !== version)
    throw new Error(
      `latest.json masih ${latest.version}, harusnya ${version} (cek log job publish)`,
    );
  const min = ((Date.now() - started) / 60000).toFixed(1);
  console.log(`  OK ${version} dalam ${min} menit: https://booth.tetraphoto.com/download/booth`);
}

await put("dev-builds/update.cmd", tool("update.cmd"), "text/plain");
await put(
  "dev-builds/setup-windows-dev.ps1",
  tool("setup-windows-dev.ps1"),
  "text/plain; charset=utf-8",
);
console.log(`  Uji saja (tanpa setup dev): unduh ${media}/dev-builds/update.cmd, dobel klik.`);
console.log(
  `  Mesin dev Windows (PowerShell): irm ${media}/dev-builds/setup-windows-dev.ps1 | iex`,
);
