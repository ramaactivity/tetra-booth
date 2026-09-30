import { z } from "zod";
import { SESSION_ID_PATTERN } from "./ids";

/** Kontrak API booth ↔ cloud (TSD §7). Endpoint lain ditambah di milestone Fase 2 masing-masing. */

export const PairRequest = z.object({ code: z.string().regex(/^\d{6}$/) });
export type PairRequest = z.infer<typeof PairRequest>;

export const PairResponse = z.object({
  token: z.string().min(40),
  deviceId: z.uuid(),
  name: z.string(),
  shortCode: z.string(),
});
export type PairResponse = z.infer<typeof PairResponse>;

/**
 * Ringkasan kondisi booth di heartbeat, disimpan di devices.status untuk pemantauan dari admin.
 * Setiap field opsional dan ditoleransi (`catch`): field lama/rusak (mis. booth ≤ 0.5.39 mengirim printer
 * sebagai teks) dibuang saja, heartbeat tetap diterima supaya booth tidak tampak offline.
 */
const tolerant = <T extends z.ZodType>(s: T) => s.optional().catch(undefined);
const count = z.number().int().nonnegative();
export const BoothStatus = z.object({
  /** Id event aktif (UUID cloud atau id bundle lokal). */
  activeEvent: tolerant(z.string().max(64)),
  activeEventName: tolerant(z.string().max(120)),
  camera: tolerant(
    z.object({
      kind: z.enum(["webcam", "simulated", "hotfolder", "canon"]),
      /** null = tidak dipantau main (webcam dikelola renderer). */
      connected: z.boolean().nullable(),
      model: z.string().max(80).nullable(),
    }),
  ),
  printer: tolerant(
    z.object({
      name: z.string().max(120).nullable(),
      status: z.string().max(40),
      message: z.string().max(200).nullable(),
    }),
  ),
  paper: tolerant(z.object({ remaining: count, capacity: count })),
  failedPrints: tolerant(count),
  uploadPending: tolerant(count),
  lastError: tolerant(z.string().max(300).nullable()),
  diskFreeGb: tolerant(z.number().nonnegative()),
});
export type BoothStatus = z.infer<typeof BoothStatus>;

export const HeartbeatRequest = z.object({
  appVersion: z.string().max(40),
  screen: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
  status: BoothStatus.catch({}).default({}),
});
export type HeartbeatRequest = z.infer<typeof HeartbeatRequest>;

/** Kode error API booth (body `{ error }`). */
export type BoothApiError =
  | "bad_request"
  | "unauthorized"
  | "invalid_code"
  | "rate_limited"
  | "not_found"
  | "conflict"
  | "payment_unavailable"
  | "server_error";

/**
 * Versi aplikasi booth terbaru (`dev-builds/latest.json` di R2, ditulis `pnpm dist:dev`, DECISIONS #80).
 * GET /api/booth/update menambahkan `url` installer bertanda tangan (bukan *.r2.dev yang diblokir ISP).
 */
export const BoothRelease = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  key: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().positive(),
});
export type BoothRelease = z.infer<typeof BoothRelease>;
export const BoothUpdateResponse = BoothRelease.extend({ url: z.url() });

/**
 * DLL Canon EDSDK untuk booth yang sudah dipasangkan (DECISIONS #112): disimpan privat di R2 (lisensi Canon,
 * repo public), booth mengunduh sendiri ke `<folder data>/edsdk` lalu mencocokkan ukuran + sha256.
 */
export const EDSDK_FILES = ["EDSDK.dll", "EdsImage.dll"] as const;
export const EdsdkManifest = z.object({
  version: z.string().min(1).max(40),
  files: z
    .array(
      z.object({
        name: z.enum(EDSDK_FILES),
        size: z.number().int().positive(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    )
    .length(EDSDK_FILES.length),
});
export const EdsdkResponse = EdsdkManifest.extend({
  files: z.array(EdsdkManifest.shape.files.element.extend({ url: z.url() })),
});
export type EdsdkResponse = z.infer<typeof EdsdkResponse>;
export type BoothUpdateResponse = z.infer<typeof BoothUpdateResponse>;

/** a > b untuk versi "x.y.z". */
export const newerVersion = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

/** GET /api/booth/events: event yang ditugaskan ke device ini. */
export const BoothEventsResponse = z.object({
  events: z.array(z.object({ id: z.uuid(), name: z.string(), bundleVersion: z.number().int() })),
});
export type BoothEventsResponse = z.infer<typeof BoothEventsResponse>;

/**
 * GET /api/booth/events/{id}/bundle: `config` = config.json bundle lokal (EventBundleSchema, id = id event),
 * `files` = isi folder bundle; booth mengunduh file yang sha256-nya berbeda.
 */
export const BundleManifest = z.object({
  bundleVersion: z.number().int(),
  config: z.record(z.string(), z.unknown()),
  files: z.array(
    z.object({
      file: z.string(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      url: z.url(),
    }),
  ),
});
export type BundleManifest = z.infer<typeof BundleManifest>;

/** Isi kolom events.bundle (ditulis skrip event:push, Fase 3: admin). */
export const StoredBundle = z.object({
  config: z.record(z.string(), z.unknown()),
  files: z.array(z.object({ file: z.string(), sha256: z.string(), key: z.string() })),
});
export type StoredBundle = z.infer<typeof StoredBundle>;

export const AssetKindSchema = z.enum([
  "strip",
  "strip_web",
  "original",
  "thumb_strip",
  "thumb_original",
  "animation",
  "video",
]);
export type AssetKindName = z.infer<typeof AssetKindSchema>;
/** Aset sesi = JPEG, kecuali animasi (GIF) & video hitung mundur (MP4, #117). Dipakai key R2, URL bertanda tangan, PUT booth. */
export const assetFile = (kind: AssetKindName) =>
  kind === "animation"
    ? { ext: "gif", contentType: "image/gif" }
    : kind === "video"
      ? { ext: "mp4", contentType: "video/mp4" }
      : { ext: "jpg", contentType: "image/jpeg" };

/** POST /api/booth/sessions: upsert metadata sesi (idempotent per id). */
export const SessionUpsert = z.object({
  id: z.string().regex(SESSION_ID_PATTERN),
  eventId: z.uuid(),
  startedAt: z.iso.datetime(),
  completedAt: z.iso.datetime(),
  photoCount: z.number().int().min(0).max(20),
  retakeCount: z.number().int().min(0).max(100),
  printCount: z.number().int().min(0).max(20),
  /** Photobox: pembayaran paket sesi ini (harus lunas & milik organisasi device). */
  paymentId: z.uuid().optional(),
  /** Jumlah aset yang akan diunggah; sesi `complete` saat semuanya tercatat. */
  assetCount: z.number().int().min(1).max(50),
});
export type SessionUpsert = z.infer<typeof SessionUpsert>;

const AssetRef = z.object({ kind: AssetKindSchema, idx: z.number().int().min(0).max(20) });

/** POST /api/booth/uploads/sign: URL PUT R2 bertanda tangan (15 menit), satu per aset. */
export const SignRequest = z.object({
  sessionId: z.string().regex(SESSION_ID_PATTERN),
  assets: z.array(AssetRef).min(1).max(20),
});
export const SignResponse = z.object({
  uploads: z.array(AssetRef.extend({ url: z.url(), key: z.string() })),
});
export type SignResponse = z.infer<typeof SignResponse>;

/** POST /api/booth/sessions/{id}/assets: catat aset yang sudah masuk R2 (idempotent per key). */
export const AssetsRequest = z.object({
  assets: z
    .array(AssetRef.extend({ bytes: z.number().int().min(1) }))
    .min(1)
    .max(20),
});
export const AssetsResponse = z.object({
  uploadStatus: z.enum(["pending", "partial", "complete"]),
});
export type AssetsResponse = z.infer<typeof AssetsResponse>;

/** POST /api/track (publik, rate-limited): analytics halaman tamu (FSD §2). */
export const TrackRequest = z.object({
  sessionId: z.string().regex(SESSION_ID_PATTERN),
  type: z.enum(["qr_open", "save", "save_all"]),
});
export type TrackRequest = z.infer<typeof TrackRequest>;

/**
 * POST /api/booth/payments: tagihan QRIS (TSD §8). Booth tidak pernah mengirim nominal; server menghitung dari
 * pengaturan event. `extraPrints` > 0 = tambahan cetak setelah foto (A7b), selain itu paket layout.
 */
export const PaymentCreateRequest = z.object({
  eventId: z.uuid(),
  sessionId: z.string().regex(SESSION_ID_PATTERN),
  layoutId: z.string().regex(/^[\w-]{1,40}$/),
  extraPrints: z.number().int().min(1).max(9).optional(),
});
export type PaymentCreateRequest = z.infer<typeof PaymentCreateRequest>;

export const PaymentStatus = z.enum(["pending", "paid", "expired", "failed"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PaymentCreateResponse = z.object({
  paymentId: z.uuid(),
  qrString: z.string().min(1),
  amount: z.number().int(),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type PaymentCreateResponse = z.infer<typeof PaymentCreateResponse>;

/** GET /api/booth/payments/{id} */
export const PaymentStatusResponse = z.object({ status: PaymentStatus });
