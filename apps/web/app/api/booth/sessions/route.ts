import { SessionUpsert } from "@tetra/shared";
import { apiError, authDevice, parseBody } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Upsert metadata sesi (TSD §4.2 langkah 3). Idempotent; event mana pun di organisasi device ini. */
export async function POST(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const s = await parseBody(req, SessionUpsert);
  if (!s) return apiError("bad_request", 400);
  const db = createServiceClient();
  // Offline-first (#259): foto yang sudah dipotret harus sampai ke cloud walau penugasan event dipindah ke booth lain
  // sebelum booth ini sempat mengunggah (B03 "Rama & Shinta": 50 sesi tertahan 404). Cukup event satu organisasi.
  const { data: ev } = await db
    .from("events")
    .select("id")
    .eq("id", s.eventId)
    .eq("organization_id", device.organizationId)
    .maybeSingle();
  if (!ev) return apiError("not_found", 404);
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
    is_test: s.isTest ?? false,
    ...(s.source && { source: s.source }),
    ...(s.groupName !== undefined && { group_name: s.groupName || null }),
    ...(paid && { payment_id: paid.id }),
  });
  if (error) return apiError("server_error", 500);
  // Photo Stage (#195): foto tersembunyi per idx (original + thumb). Aset yang belum terunggah ikut saat upsert
  // berikutnya (laptop mengirim ulang metadata setelah asetnya masuk).
  if (s.hiddenIdx) {
    const at = new Date().toISOString();
    const base = () =>
      db
        .from("assets")
        .update({ hidden_at: at })
        .eq("session_id", s.id)
        .eq("organization_id", device.organizationId)
        .in("kind", ["original", "thumb_original"]);
    const hide = s.hiddenIdx.length
      ? await base().in("idx", s.hiddenIdx).is("hidden_at", null)
      : { error: null };
    const show = await db
      .from("assets")
      .update({ hidden_at: null })
      .eq("session_id", s.id)
      .eq("organization_id", device.organizationId)
      .not("idx", "in", `(${s.hiddenIdx.join(",") || 0})`)
      .not("hidden_at", "is", null);
    if (hide.error || show.error) return apiError("server_error", 500);
  }
  return Response.json({ ok: true });
}
