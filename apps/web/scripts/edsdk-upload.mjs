// Unggah DLL SDK kamera ke folder privat R2 (DECISIONS #112; Lumix #214; Nikon #216).
//   pnpm --filter web edsdk:upload <folder berisi EDSDK.dll & EdsImage.dll> <versi>
//   pnpm --filter web edsdk:upload <folder berisi Lmxptpif.dll> <versi> lumix
//   pnpm --filter web edsdk:upload <folder berisi Type0001–0031.md3 + NkdPTP.dll dll.> <versi> nikon
//   pnpm --filter web edsdk:upload <folder berisi ControlServiceLayer.dll + .config> <versi> nikonz
// Nama folder = HMAC secret R2 (sama dengan apps/web/lib/r2.ts edsdkPrefix), tidak dicetak ke log.
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const [dir, version, kit = "edsdk"] = process.argv.slice(2);
// Sama dengan SDK_FILES di packages/shared/src/booth-api.ts.
const nikonDlls = ["NkdPTP.dll", "NkRoyalmile.dll", "dnssd.dll"];
const names = {
  edsdk: ["EDSDK.dll", "EdsImage.dll"],
  lumix: ["Lmxptpif.dll"],
  nikon: [
    ...nikonDlls,
    ...Array.from({ length: 31 }, (_, i) => `Type${String(i + 1).padStart(4, "0")}.md3`),
  ],
  nikonz: [
    "ControlServiceLayer.dll",
    ...nikonDlls,
    "DC_PTP_Config.config",
    "MaidLayer.config",
    "RangeValue.config",
  ],
}[kit];
if (!dir || !version || !names)
  throw new Error("pakai: edsdk-upload.mjs <folder> <versi> [edsdk|lumix|nikon|nikonz]");
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
const prefix = `private/${kit}/${createHmac("sha256", env("R2_SECRET_ACCESS_KEY")).update(`tetra-${kit}`).digest("hex").slice(0, 32)}/`;
const put = (Key, Body, ContentType) =>
  s3.send(new PutObjectCommand({ Bucket: env("R2_BUCKET"), Key, Body, ContentType }));
const files = [];
for (const name of names) {
  const b = readFileSync(join(dir, name));
  await put(`${prefix}${name}`, b, "application/octet-stream");
  files.push({ name, size: b.length, sha256: createHash("sha256").update(b).digest("hex") });
  console.log(`diunggah ${name} (${b.length} B)`);
}
await put(`${prefix}manifest.json`, JSON.stringify({ version, files }), "application/json");
console.log(`manifest ${kit} ${version} diunggah`);
