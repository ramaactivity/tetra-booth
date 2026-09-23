// Build dev untuk laptop Windows uji: Electron (win-x64) + Camera Service (self-contained win-x64)
// → satu zip → upload ke R2 `dev-builds/tetra-booth-dev.zip`. Di Windows: tools/windows/update.cmd.
// Jalankan: pnpm dist:dev   (butuh R2_* dan NEXT_PUBLIC_MEDIA_URL di apps/web/.env.local)

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
const KEY = "dev-builds/tetra-booth-dev.zip";

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
const crlf = (t) => t.replace(/\r?\n/g, "\r\n"); // cmd.exe butuh CRLF
writeFileSync("dist/app/run.cmd", crlf(readFileSync("tools/windows/run.cmd", "utf8")));
writeFileSync("dist/app/VERSION.txt", `${version}\n`);
sh("zip -qr ../tetra-booth-dev.zip .", "dist/app");
const zip = readFileSync("dist/tetra-booth-dev.zip");
console.log(
  `  ${(statSync("dist/tetra-booth-dev.zip").size / 1e6).toFixed(0)} MB, build ${version}`,
);

console.log("\n[4/4] Upload ke R2");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
  },
});
await s3.send(
  new PutObjectCommand({
    Bucket: need("R2_BUCKET"),
    Key: KEY,
    Body: zip,
    ContentType: "application/zip",
    CacheControl: "no-cache",
  }),
);
const media = need("NEXT_PUBLIC_MEDIA_URL");
const updater = crlf(
  readFileSync("tools/windows/update.cmd", "utf8").replace("__MEDIA_URL__", media),
);
writeFileSync("dist/update.cmd", updater);
await s3.send(
  new PutObjectCommand({
    Bucket: need("R2_BUCKET"),
    Key: "dev-builds/update.cmd",
    Body: updater,
    ContentType: "text/plain",
    CacheControl: "no-cache",
  }),
);
console.log(`  OK: ${media}/${KEY}`);
console.log(
  `  Laptop Windows (sekali saja): unduh ${media}/dev-builds/update.cmd ke folder mana pun, lalu dobel klik tiap kali mau update.`,
);
