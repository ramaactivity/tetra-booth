import "server-only";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`env ${k} belum diisi`);
  return v;
};

let s3: S3Client | undefined;
const client = () =>
  (s3 ??= new S3Client({
    region: "auto",
    endpoint: `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env("R2_ACCESS_KEY_ID"),
      secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
    },
  }));

/** URL PUT bertanda tangan untuk upload langsung dari booth ke R2 (TSD §4.2, berlaku 15 menit). */
export const presignPut = (key: string, contentType: string) =>
  getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: env("R2_BUCKET"), Key: key, ContentType: contentType }),
    { expiresIn: 15 * 60 },
  );
