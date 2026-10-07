import { GUEST_MAX_BYTES, GuestDoneRequest, guestParts, idxAllowed } from "@tetra/shared";
import { apiError, parseBody } from "@/lib/booth";
import { guestEvent, guestKey, guestMe, guestSession } from "@/lib/guest-cam";
import { deleteObjects, objectBytes } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Catat unggahan tamu setelah PUT (#197). Server memeriksa ukuran objek di R2 (URL PUT tidak bisa membatasi
 * ukuran); kebesaran/hilang → dihapus dan ditolak. Idempoten per key. Mode approval manual → `review_status`
 * pending (hanya untuk baris baru, persetujuan yang sudah ada tidak direset).
 */
export async function POST(req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const s = await guestSession(ev);
  if (!s) return apiError("unauthorized", 401);
  const body = await parseBody(req, GuestDoneRequest);
  if (!body || !idxAllowed(ev.cam, body.kind, body.idx)) return apiError("bad_request", 400);

  const parts = guestParts(body.kind, body.audioType).map((p) => ({
    ...p,
    key: guestKey(ev, s.id, p.kind, body.idx, p.ext),
  }));
  const sizes = await Promise.all(parts.map((p) => objectBytes(p.key)));
  const max = (p: (typeof parts)[number]) =>
    p.kind === "audio"
      ? GUEST_MAX_BYTES.audio
      : p.part === "thumb"
        ? GUEST_MAX_BYTES.thumb
        : GUEST_MAX_BYTES.photo;
  if (parts.some((p, i) => !sizes[i] || (sizes[i] ?? 0) > max(p))) {
    await deleteObjects(parts.map((p) => p.key)).catch(() => {});
    return apiError("bad_request", 400);
  }

  const db = createServiceClient();
  const { error } = await db.from("assets").upsert(
    parts.map((p, i) => ({
      organization_id: ev.organization_id,
      session_id: s.id,
      kind: p.kind,
      idx: body.idx,
      bytes: sizes[i] ?? null,
      r2_key: p.key,
      review_status: ev.cam.approval === "manual" ? "pending" : null,
    })),
    { onConflict: "r2_key", ignoreDuplicates: true },
  );
  if (error) return apiError("server_error", 500);

  const { data: rows } = await db
    .from("assets")
    .select("kind")
    .eq("organization_id", ev.organization_id)
    .eq("session_id", s.id);
  const photos = (rows ?? []).filter((a) => a.kind === "original").length;
  await db
    .from("sessions")
    .update({
      photo_count: photos,
      asset_count: rows?.length ?? 0,
      upload_status: "complete",
      completed_at: new Date().toISOString(),
    })
    .eq("id", s.id)
    .eq("organization_id", ev.organization_id);
  return Response.json(await guestMe(ev, s));
}
