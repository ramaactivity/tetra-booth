import { z } from "zod";
import { apiError, clientIp, parseBody, rateOk } from "@/lib/booth";
import { bumpBundle } from "@/lib/bundle-bump";
import { eventByClientToken } from "@/lib/gallery";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ enabled: z.boolean() });

/** Toggle galeri publik dari galeri klien (TSD §7, desain C4). Pemegang link klien = klien. */
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!(await rateOk(`pubgal:${clientIp(req)}`, 60, 30))) return apiError("rate_limited", 429);
  const ev = await eventByClientToken((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const body = await parseBody(req, Body);
  if (!body) return apiError("bad_request", 400);
  const db = createServiceClient();
  const { error } = await db
    .from("events")
    .update({ public_gallery: body.enabled })
    .eq("id", ev.id)
    .eq("organization_id", ev.organization_id);
  if (error) return apiError("server_error", 500);
  // QR galeri di TV Photo Stage ikut muncul/hilang (#199).
  await bumpBundle(db, ev.organization_id, ev.id);
  return Response.json({ enabled: body.enabled });
}
