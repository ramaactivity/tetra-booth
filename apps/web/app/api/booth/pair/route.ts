import { randomBytes } from "node:crypto";
import { PairRequest, type PairResponse } from "@tetra/shared";
import { apiError, clientIp, parseBody, rateOk, sha256 } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Tukar kode pairing 6 digit (sekali pakai, 10 menit) → device token permanen (FSD §1.2, TSD §5). */
export async function POST(req: Request) {
  // 6 digit = 10^6 kemungkinan: batasi tebakan per IP.
  if (!(await rateOk(`pair:${clientIp(req)}`, 600, 10))) return apiError("rate_limited", 429);
  const body = await parseBody(req, PairRequest);
  if (!body) return apiError("bad_request", 400);

  const token = randomBytes(40).toString("base64url");
  // Satu UPDATE atomik: kode cocok, belum kedaluwarsa, device belum dicabut → token baru, kode hangus.
  const { data, error } = await createServiceClient()
    .from("devices")
    .update({ token_hash: sha256(token), pairing_code: null, pairing_expires_at: null })
    .eq("pairing_code", body.code)
    .gt("pairing_expires_at", new Date().toISOString())
    .is("revoked_at", null)
    .select("id, name, short_code")
    .maybeSingle();
  if (error) return apiError("server_error", 500);
  if (!data) return apiError("invalid_code", 400);
  return Response.json({
    token,
    deviceId: data.id,
    name: data.name,
    shortCode: data.short_code,
  } satisfies PairResponse);
}
