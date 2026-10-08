import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { opsOrgId } from "./ops-sync";

/**
 * API untuk Hermes (agen sales Bruno, #215): Bearer `HERMES_API_TOKEN`, organisasi = `TETRA_OPS_ORG_ID` (Tetra).
 * null = token salah / belum dikonfigurasi.
 */
export function hermesOrg(req: Request): string | null {
  const want = process.env.HERMES_API_TOKEN ?? "";
  const org = opsOrgId();
  const got = /^Bearer (.+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
  if (want.length < 32 || !org) return null;
  // Bandingkan hash supaya panjang sama dan waktu konstan.
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(want), h(got)) ? org : null;
}

export const HERMES_STATUSES = [
  "new",
  "queued",
  "sent",
  "replied",
  "converted",
  "opted_out",
] as const;
