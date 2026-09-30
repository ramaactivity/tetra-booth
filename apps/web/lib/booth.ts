import "server-only";
import { createHash } from "node:crypto";
import { type AssetKindName, assetFile, type BoothApiError } from "@tetra/shared";
import type { ZodType } from "zod";
import { createServiceClient } from "@/lib/supabase/service";

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export const apiError = (error: BoothApiError, status: number) =>
  Response.json({ error }, { status });

/** Body JSON tervalidasi, atau `null` kalau bukan JSON / tidak cocok skema. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T | null> {
  const body: unknown = await req.json().catch(() => undefined);
  const r = schema.safeParse(body);
  return r.success ? r.data : null;
}

export type Device = { id: string; organizationId: string };

/** `Authorization: Bearer {deviceToken}` → device yang belum dicabut, atau `null`. */
export async function authDevice(req: Request): Promise<Device | null> {
  const token = /^Bearer (\S{40,})$/.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return null;
  const { data } = await createServiceClient()
    .from("devices")
    .select("id, organization_id")
    .eq("token_hash", sha256(token))
    .is("revoked_at", null)
    .maybeSingle();
  return data ? { id: data.id, organizationId: data.organization_id } : null;
}

/**
 * Event yang boleh dipakai device ini (DECISIONS #127): satu organisasi, tidak diarsip, dan `all_devices`
 * (bawaan) atau device ditugaskan di event_devices. `eventId` kosong = semua event yang boleh.
 */
export async function deviceEvents(device: Device, eventId?: string) {
  const db = createServiceClient();
  let q = db
    .from("events")
    .select(
      "id, name, mode, settings, bundle_version, bundle, all_devices, event_devices(device_id)",
    )
    .eq("organization_id", device.organizationId)
    .neq("status", "archived");
  if (eventId) q = q.eq("id", eventId);
  const { data, error } = await q;
  if (error) throw error;
  return data.filter(
    (e) => e.all_devices || e.event_devices.some((d) => d.device_id === device.id),
  );
}

/** IP klien untuk rate limit (Vercel mengisi x-forwarded-for). */
export const clientIp = (req: Request) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

/** true = masih boleh (fungsi Postgres `rate_hit`, jendela tetap). Gagal cek → izinkan, jangan blokir booth. */
export async function rateOk(key: string, windowSec: number, max: number): Promise<boolean> {
  const { data, error } = await createServiceClient().rpc("rate_hit", {
    k: key,
    window_s: windowSec,
    max_hits: max,
  });
  return error ? true : data !== false;
}

/** Sesi milik device ini (dan organisasinya), atau `null`. */
export async function deviceSession(device: Device, id: string) {
  const { data } = await createServiceClient()
    .from("sessions")
    .select("id, event_id, asset_count")
    .eq("id", id)
    .eq("device_id", device.id)
    .eq("organization_id", device.organizationId)
    .maybeSingle();
  return data;
}

/** Key R2 aset sesi (TSD §4.2): `{org}/{event}/sessions/{id}/{kind}_{idx}.jpg`. */
export const sessionAssetKey = (
  device: Device,
  eventId: string,
  sessionId: string,
  kind: AssetKindName,
  idx: number,
) =>
  `${device.organizationId}/${eventId}/sessions/${sessionId}/${kind}_${idx}.${assetFile(kind).ext}`;
