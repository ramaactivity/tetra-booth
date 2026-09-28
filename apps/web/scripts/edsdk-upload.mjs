// Unggah DLL Canon EDSDK ke folder privat R2 (DECISIONS #112).
//   pnpm --filter web edsdk:upload <folder berisi EDSDK.dll & EdsImage.dll> <versi>
// Nama folder = HMAC secret R2 (sama dengan apps/web/lib/r2.ts edsdkPrefix), tidak dicetak ke log.
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const [dir, version] = process.argv.slice(2);
if (!dir || !version) throw new Error("pakai: edsdk-upload.mjs <folder> <versi>");
const env = (k) =>
  process.env[k] ??
  (() => {
    throw new Error(`${k} kosong`);
  })();
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: env("R2_ACCESS_KEY_ID"),
    secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  },
});
const prefix = `private/edsdk/${createHmac("sha256", env("R2_SECRET_ACCESS_KEY")).update("tetra-edsdk").digest("hex").slice(0, 32)}/`;
const put = (Key, Body, ContentType) =>
  s3.send(new PutObjectCommand({ Bucket: env("R2_BUCKET"), Key, Body, ContentType }));
const files = [];
for (const name of ["EDSDK.dll", "EdsImage.dll"]) {
  const b = readFileSync(join(dir, name));
  await put(`${prefix}${name}`, b, "application/octet-stream");
  files.push({ name, size: b.length, sha256: createHash("sha256").update(b).digest("hex") });
  console.log(`diunggah ${name} (${b.length} B)`);
}
await put(`${prefix}manifest.json`, JSON.stringify({ version, files }), "application/json");
console.log(`manifest EDSDK ${version} diunggah`);
