import { bearerOk, opsOrgId } from "@/lib/ops-sync";
import { createServiceClient } from "@/lib/supabase/service";

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
      "id, slug, name, event_date, status, client_token, client_expires_at, purge_at, purged_at",
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

  return Response.json({
    ops_project_id: projectId,
    events: (events ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      event_date: e.event_date,
      status: e.status,
      modules: ["photobooth"],
      gallery_url: e.client_token && !e.purged_at ? `${origin}/g/${e.slug}` : null,
      client_expires_at: e.client_expires_at,
      purge_at: e.purge_at,
      session_count: Number(byId.get(e.id)?.sessions ?? 0),
      photo_count: Number(byId.get(e.id)?.photos ?? 0),
    })),
  });
}
