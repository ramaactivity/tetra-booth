import { createHmac } from "node:crypto";
import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BoothRelease } from "@tetra/shared";

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

/** Hapus objek (moderasi, retensi). Maks 1000 key per panggilan S3. */
export async function deleteObjects(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    if (batch.length)
      await client().send(
        new DeleteObjectsCommand({
          Bucket: env("R2_BUCKET"),
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        }),
      );
  }
}

/** Semua key di bawah prefix (retensi: hapus satu event). */
export async function listKeys(prefix: string) {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const r = await client().send(
      new ListObjectsV2Command({
        Bucket: env("R2_BUCKET"),
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of r.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/** Isi objek sebagai stream (ZIP galeri). */
export async function getStream(key: string) {
  const r = await client().send(new GetObjectCommand({ Bucket: env("R2_BUCKET"), Key: key }));
  return r.Body?.transformToWebStream();
}

/**
 * Folder privat DLL Canon EDSDK di R2 (DECISIONS #112). Nama folder = HMAC dari secret R2 (tidak ada di repo),
 * jadi tidak bisa ditebak walau bucket punya akses publik r2.dev; booth hanya menerima URL bertanda tangan.
 */
export const edsdkPrefix = () =>
  `private/edsdk/${createHmac("sha256", env("R2_SECRET_ACCESS_KEY")).update("tetra-edsdk").digest("hex").slice(0, 32)}/`;

/** Rilis booth terbaru (`dev-builds/latest.json`, DECISIONS #80), null kalau belum ada. */
export async function latestBoothRelease() {
  const stream = await getStream("dev-builds/latest.json").catch(() => undefined);
  if (!stream) return null;
  const r = BoothRelease.safeParse(await new Response(stream).json().catch(() => null));
  return r.success ? r.data : null;
}
