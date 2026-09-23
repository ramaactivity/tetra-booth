// Cek kredensial & bucket R2 dev: upload 1 objek uji, baca kembali, hapus.
// Jalankan: pnpm --filter web r2:check  (butuh R2_* di apps/web/.env.local)
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const need = (k) =>
  process.env[k] ||
  (() => {
    throw new Error(`env ${k} belum diisi`);
  })();
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${need("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: need("R2_ACCESS_KEY_ID"),
    secretAccessKey: need("R2_SECRET_ACCESS_KEY"),
  },
});
const Bucket = need("R2_BUCKET");
const Key = `_check/${Date.now()}.txt`;
await s3.send(
  new PutObjectCommand({ Bucket, Key, Body: "tetra r2 ok", ContentType: "text/plain" }),
);
const got = await (await s3.send(new GetObjectCommand({ Bucket, Key }))).Body.transformToString();
await s3.send(new DeleteObjectCommand({ Bucket, Key }));
if (got !== "tetra r2 ok") throw new Error("isi objek tidak cocok");
console.log(`R2 OK: bucket ${Bucket}, tulis/baca/hapus berhasil`);
