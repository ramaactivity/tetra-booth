import { z } from "zod";

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
  | "server_error";
