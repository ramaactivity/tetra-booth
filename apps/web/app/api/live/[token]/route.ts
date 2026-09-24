import { apiError } from "@/lib/booth";
import { loadLive } from "@/lib/live";

export const dynamic = "force-dynamic";

/** Polling slideshow (tiap 5 dtk): strip terbaru dengan URL bertanda tangan. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const live = await loadLive((await ctx.params).token);
  if (!live) return apiError("not_found", 404);
  return Response.json(live.strips, { headers: { "cache-control": "no-store" } });
}
