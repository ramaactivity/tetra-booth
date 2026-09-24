import { z } from "zod";
import { apiError, clientIp, parseBody, rateOk } from "@/lib/booth";
import { eventByClientToken } from "@/lib/gallery";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ assetId: z.uuid() });

/** Toggle favorit galeri klien (TSD §7). Hanya aset sesi event ini yang tidak disembunyikan/dihapus. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await rateOk(`fav:${clientIp(req)}`, 60, 120))) return apiError("rate_limited", 429);
  const ev = await eventByClientToken((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const body = await parseBody(req, Body);
  if (!body) return apiError("bad_request", 400);
  const db = createServiceClient();
  const { data: asset } = await db
    .from("assets")
    .select("id, sessions!inner(event_id, hidden_at, deleted_at)")
    .eq("id", body.assetId)
    .eq("organization_id", ev.organization_id)
    .eq("sessions.event_id", ev.id)
    .is("sessions.hidden_at", null)
    .is("sessions.deleted_at", null)
    .maybeSingle();
  if (!asset) return apiError("not_found", 404);
  const { data: existing } = await db
    .from("favorites")
    .delete()
    .eq("event_id", ev.id)
    .eq("asset_id", asset.id)
    .select("asset_id");
  if (existing?.length) return Response.json({ favorite: false });
  const { error } = await db
    .from("favorites")
    .insert({ organization_id: ev.organization_id, event_id: ev.id, asset_id: asset.id });
  if (error) return apiError("server_error", 500);
  return Response.json({ favorite: true });
}
