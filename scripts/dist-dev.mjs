// Build dev untuk laptop Windows uji: Electron (win-x64) + Camera Service (self-contained win-x64)
// -> satu zip -> upload ke R2 `dev-builds/`. Ikut di-upload: update.cmd & setup-windows-dev.ps1.
// Jalankan: pnpm dist:dev            (build + upload semua)
//           pnpm dist:dev --tools    (hanya upload script Windows, tanpa build)
// Butuh R2_* dan NEXT_PUBLIC_MEDIA_URL di apps/web/.env.local.

import { execSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
  const version = `${execSync("git rev-parse --short HEAD").toString().trim()} ${new Date().toISOString().slice(0, 16)}`;
  rmSync("dist", { recursive: true, force: true });
  mkdirSync("dist/app", { recursive: true });

  console.log("\n[1/4] Electron win-x64");
  sh("pnpm --filter booth build");
  sh("pnpm exec electron-builder --win --x64 --dir --publish never", "apps/booth");
  cpSync("apps/booth/release/win-unpacked", "dist/app/booth", { recursive: true });

  console.log("\n[2/4] Camera Service win-x64 self-contained");
  sh(
    "dotnet publish services/camera/TetraCamera.Host -c Release -r win-x64 --self-contained -o dist/app/camera",
  );

  console.log("\n[3/4] Zip");
  writeFileSync("dist/app/run.cmd", tool("run.cmd"));
  writeFileSync("dist/app/VERSION.txt", `${version}\n`);
  sh("zip -qr ../tetra-booth-dev.zip .", "dist/app");
  console.log(
    `  ${(statSync("dist/tetra-booth-dev.zip").size / 1e6).toFixed(0)} MB, build ${version}`,
  );

  console.log("\n[4/4] Upload ke R2");
  await put(
    "dev-builds/tetra-booth-dev.zip",
    readFileSync("dist/tetra-booth-dev.zip"),
    "application/zip",
  );
  console.log(`  OK: ${media}/dev-builds/tetra-booth-dev.zip`);
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
