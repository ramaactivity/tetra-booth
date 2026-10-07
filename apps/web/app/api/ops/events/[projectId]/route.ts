import { parseRun, runState } from "@tetra/shared";
import { eventPhase, ymdWib } from "@/lib/events";
import { bearerOk, opsOrgId } from "@/lib/ops-sync";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

type Db = ReturnType<typeof createServiceClient>;
const DAY = 86_400;
const key = (k: string) => k.split("#")[0] ?? k;

/**
 * Cuplikan galeri untuk kartu dashboard klien Ops (#185): sampul = foto original sesi terbaru (strip kalau tidak
 * ada), `thumbs` = satu thumbnail per sesi dari 6 sesi terbaru, `modules` ikut `photo_stage`/`guest_cam` bila ada sesinya.
 * URL presigned 1 hari; Ops mengambil ulang tiap render, tidak menyimpannya. Foto tersembunyi/terhapus/tes tidak ikut.
 */
async function preview(db: Db, org: string, eventId: string, withPhotos: boolean) {
  const visible = () =>
    db
      .from("sessions")
      .select("id, source")
      .eq("organization_id", org)
      .eq("event_id", eventId)
      .eq("is_test", false)
      .is("hidden_at", null)
      .is("deleted_at", null);
  const { data: stage } = await visible().eq("source", "stage").limit(1);
  const { data: guest } = await visible().eq("source", "guest").limit(1);
  const modules = [
    "photobooth",
    ...(stage?.length ? ["photo_stage"] : []),
    ...(guest?.length ? ["guest_cam"] : []),
  ];
  if (!withPhotos) return { modules, cover_url: null, thumbs: [] };
  // Hanya sesi yang fotonya sudah lengkap terunggah (rombongan stage yang masih dikirim belum punya foto).
  // Guest Cam (#197) tidak ikut cuplikan: bisa belum disetujui / belum dibuka.
  const { data: sessions } = await visible()
    .neq("source", "guest")
    .eq("upload_status", "complete")
    .order("started_at", { ascending: false })
    .limit(6);
  const ids = (sessions ?? []).map((s) => s.id);
  const { data: assets } = ids.length
    ? await db
        .from("assets")
        .select("session_id, kind, idx, r2_key")
        .eq("organization_id", org)
        .in("session_id", ids)
        .in("kind", ["original", "strip_web", "thumb_original", "thumb_strip"])
        .is("hidden_at", null)
        .order("idx")
    : { data: [] };
  const first = (sid: string, kind: string) =>
    (assets ?? []).find((a) => a.session_id === sid && a.kind === kind);
  const thumbs = [];
  for (const s of sessions ?? []) {
    const stage = s.source === "stage";
    const a = first(s.id, stage ? "thumb_original" : "thumb_strip");
    if (a)
      thumbs.push({
        url: await presignGet(key(a.r2_key), DAY),
        kind: stage ? "original" : "strip",
      });
  }
  const latest = ids[0] ?? "";
  const cover = first(latest, "original") ?? first(latest, "strip_web");
  return { modules, cover_url: cover ? await presignGet(key(cover.r2_key), DAY) : null, thumbs };
}

/** Fase event yang sama dengan daftar admin; `status` Booth tidak pernah menjadi `completed`. */
const PHASE = { mendatang: "upcoming", berlangsung: "live", selesai: "done" } as const;

/**
 * Bagian "Acara & Galeri" di portal klien Tetra Ops (kontrak v0.2 §5, DECISIONS #173): semua event Booth yang
 * diimpor dari satu booking (bisa > 1, satu per spot). Bearer `TETRA_OPS_API_TOKEN`. `gallery_url` hanya diisi bila
 * link galeri klien aktif dan foto belum dihapus.
 */
export async function GET(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const token = process.env.TETRA_OPS_API_TOKEN ?? "";
  const org = opsOrgId();
  if (!token || !org) return new Response("not configured", { status: 503 });
  if (!bearerOk(req.headers.get("authorization"), token))
    return new Response("unauthorized", { status: 401 });
  const projectId = (await ctx.params).projectId;
  if (!/^[\w-]{1,64}$/.test(projectId)) return new Response("bad request", { status: 400 });

  const db = createServiceClient();
  const { data: events, error } = await db
    .from("events")
    .select(
      "id, slug, name, event_date, status, run, client_token, client_expires_at, purge_at, purged_at",
    )
    .eq("organization_id", org)
    .eq("ops_project_id", projectId)
    .order("event_date")
    .order("created_at");
  if (error) return new Response("server error", { status: 500 });
  const ids = (events ?? []).map((e) => e.id);
  const { data: stats } = ids.length
    ? await db.rpc("ops_event_stats", { org, evs: ids })
    : { data: [] };
  const byId = new Map((stats ?? []).map((s) => [s.event_id, s]));
  const origin = new URL(req.url).origin;
  const today = ymdWib(Date.now());

  const previews = await Promise.all(
    (events ?? []).map((e) => preview(db, org, e.id, !!e.client_token && !e.purged_at)),
  );

  return Response.json({
    ops_project_id: projectId,
    events: (events ?? []).map((e, i) => ({
      id: e.id,
      name: e.name,
      event_date: e.event_date,
      status: e.status,
      phase: PHASE[eventPhase(e.event_date, runState(parseRun(e.run)), today)],
      gallery_url: e.client_token && !e.purged_at ? `${origin}/g/${e.slug}` : null,
      client_expires_at: e.client_expires_at,
      purge_at: e.purge_at,
      session_count: Number(byId.get(e.id)?.sessions ?? 0),
      photo_count: Number(byId.get(e.id)?.photos ?? 0),
      ...previews[i],
    })),
  });
}
