// Upload installer booth hasil CI ke R2 `dev-builds/` (DECISIONS #293). Dijalankan job `publish` di
// .github/workflows/booth-installer.yml: koneksi GitHub → Cloudflare cepat, laptop tidak perlu mengunduh/meng-upload.
// Pakai: node scripts/publish-booth.mjs <folder berisi Tetra-Booth-Setup-<versi>.exe (+ .blockmap)>
// Butuh env R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const need = (k) =>
  process.env[k] ||
  (() => {
    throw new Error(`env ${k} belum diisi`);
  })();
const dir = process.argv[2] ?? "dist/installer";
const { version } = JSON.parse(readFileSync("apps/booth/package.json", "utf8"));
const setup = `Tetra-Booth-Setup-${version}.exe`;
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

const exe = readFileSync(join(dir, setup));
const exeType = "application/vnd.microsoft.portable-executable";
// Nama tetap (link untuk crew) + nama berversi (yang dirujuk latest.json).
await Promise.all([
  put("dev-builds/Tetra-Booth-Setup.exe", exe, exeType),
  put(`dev-builds/${setup}`, exe, exeType),
]);
// Blockmap = update diferensial (DECISIONS #139). Tidak ada = booth unduh penuh.
const blockmap = join(dir, `${setup}.blockmap`);
const blockmapKey = existsSync(blockmap) ? `dev-builds/${setup}.blockmap` : undefined;
if (blockmapKey) await put(blockmapKey, readFileSync(blockmap), "application/gzip");
// Dibaca /api/booth/update & /download/booth (DECISIONS #80). Ditulis terakhir: booth baru melihat rilis setelah
// installernya lengkap di R2.
const release = {
  version,
  key: `dev-builds/${setup}`,
  sha256: createHash("sha256").update(exe).digest("hex"),
  size: exe.byteLength,
  blockmapKey,
};
await put("dev-builds/latest.json", JSON.stringify(release, null, 2), "application/json");
console.log(`R2: ${setup} (${(exe.byteLength / 1e6).toFixed(0)} MB), latest.json → ${version}`);
