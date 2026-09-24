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

export const HeartbeatRequest = z.object({
  appVersion: z.string().max(40),
  screen: z.object({ width: z.number().int(), height: z.number().int() }).optional(),
  /** Status bebas (event aktif, kamera, printer, kertas, antrean, error terakhir); disimpan apa adanya. */
  status: z.record(z.string(), z.unknown()).default({}),
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
  | "server_error";

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
]);
export type AssetKindName = z.infer<typeof AssetKindSchema>;
/** Aset sesi = JPEG, kecuali animasi (GIF). Dipakai key R2, URL bertanda tangan, dan PUT booth. */
export const assetFile = (kind: AssetKindName) =>
  kind === "animation"
    ? { ext: "gif", contentType: "image/gif" }
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
