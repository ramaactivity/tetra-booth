import { SessionUpsert } from "@tetra/shared";
import { apiError, authDevice, parseBody } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Upsert metadata sesi (TSD §4.2 langkah 3). Idempotent; hanya untuk event yang ditugaskan ke device ini. */
export async function POST(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const s = await parseBody(req, SessionUpsert);
  if (!s) return apiError("bad_request", 400);
  const db = createServiceClient();
  const { data: assigned } = await db
    .from("event_devices")
    .select("event_id")
    .eq("event_id", s.eventId)
    .eq("device_id", device.id)
    .eq("organization_id", device.organizationId)
    .maybeSingle();
  if (!assigned) return apiError("not_found", 404);
  // ID sesi dibuat booth: ID yang sudah dipakai device/organisasi lain ditolak, bukan ditimpa.
  const { data: other } = await db
    .from("sessions")
    .select("device_id")
    .eq("id", s.id)
    .neq("device_id", device.id)
    .maybeSingle();
  if (other) return apiError("conflict", 409);
  // Photobox: tautkan pembayaran paket yang lunas milik device ini; selain itu diabaikan (upload tidak boleh gagal).
  const { data: paid } = s.paymentId
    ? await db
        .from("payments")
        .select("id")
        .eq("id", s.paymentId)
        .eq("device_id", device.id)
        .eq("organization_id", device.organizationId)
        .eq("status", "paid")
        .maybeSingle()
    : { data: null };
  const { error } = await db.from("sessions").upsert({
    id: s.id,
    organization_id: device.organizationId,
    event_id: s.eventId,
    device_id: device.id,
    started_at: s.startedAt,
    completed_at: s.completedAt,
    photo_count: s.photoCount,
    retake_count: s.retakeCount,
    print_count: s.printCount,
    asset_count: s.assetCount,
    ...(paid && { payment_id: paid.id }),
  });
  if (error) return apiError("server_error", 500);
  return Response.json({ ok: true });
}
