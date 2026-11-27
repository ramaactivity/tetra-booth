// Tandai versi booth yang terbukti stabil (permintaan Rama 27 Nov): tiap laptop menyimpan installer versi ini dan
// crew bisa "Kembali ke versi stabil" dari Backstage → Update Aplikasi tanpa internet.
// Jalankan: pnpm booth:stable 0.6.44      (installer versi itu harus masih ada di R2 dev-builds/)
//           pnpm booth:stable             (lihat versi stabil sekarang)
// Butuh R2_* di apps/web/.env.local. Jangan hapus installer versi stabil saat merapikan dev-builds/.

import { createHash } from "node:crypto";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const need = (k) =>
  process.env[k] ||
  (() => {
    throw new Error(`env ${k} belum diisi`);
  })();
const Bucket = need("R2_BUCKET");
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
  },
});
const STABLE = "dev-builds/stable.json";
const version = process.argv[2];

if (!version) {
  const cur = await s3
    .send(new GetObjectCommand({ Bucket, Key: STABLE }))
    .then((r) => r.Body.transformToString())
    .catch(() => null);
  console.log(
    cur ? `Versi stabil sekarang: ${JSON.parse(cur).version}` : "Belum ada versi stabil.",
  );
  process.exit(0);
}
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`versi tidak valid: ${version}`);

const key = `dev-builds/Tetra-Booth-Setup-${version}.exe`;
const blockmapKey = `${key}.blockmap`;
const obj = await s3.send(new GetObjectCommand({ Bucket, Key: key })).catch(() => null);
if (!obj) throw new Error(`${key} tidak ada di R2 (sudah dirapikan?)`);
const hasBlockmap = await s3
  .send(new HeadObjectCommand({ Bucket, Key: blockmapKey }))
  .then(() => true)
  .catch(() => false);
// sha256 dihitung dari file di R2 (latest.json lama sudah tertimpa); booth mencocokkannya setelah mengunduh.
const h = createHash("sha256");
let size = 0;
for await (const chunk of obj.Body) {
  h.update(chunk);
  size += chunk.length;
}
const release = {
  version,
  key,
  sha256: h.digest("hex"),
  size,
  ...(hasBlockmap && { blockmapKey }),
};
await s3.send(
  new PutObjectCommand({
    Bucket,
    Key: STABLE,
    Body: JSON.stringify(release, null, 2),
    ContentType: "application/json",
  }),
);
console.log(
  `Versi stabil → ${version} (${(size / 1e6).toFixed(0)} MB, sha256 ${release.sha256.slice(0, 12)}…)`,
);
console.log("Booth menyimpannya saat senggang & sebelum update (Backstage → Update Aplikasi).");
