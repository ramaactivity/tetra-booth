import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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
    // Path-style: host akun yang sama untuk semua bucket (terjangkau dari ISP Indonesia, W-026).
    forcePathStyle: true,
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

/**
 * URL GET bertanda tangan ke endpoint S3 R2 (`*.r2.cloudflarestorage.com`). Dipakai untuk semua baca publik
 * karena `*.r2.dev` diblokir Internet Positif di ISP Indonesia (W-026, DECISIONS #63).
 * ponytail: tanpa cache CDN; ganti ke custom domain media.* setelah DNS pindah ke Cloudflare.
 */
export const presignGet = (key: string, expiresIn = 60 * 60) =>
  getSignedUrl(client(), new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }), {
    expiresIn,
  });

/** Tulis objek dari server (overlay template admin). */
export const putObject = (key: string, body: Uint8Array, contentType: string) =>
  client().send(
    new PutObjectCommand({
      Bucket: env("R2_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
