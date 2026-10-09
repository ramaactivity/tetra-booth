import { loadStageDisplay } from "@/lib/stage-display";

export const dynamic = "force-dynamic";

/** Data layar galeri Photo Stage (#204), di-poll tiap 5 dtk oleh `/stage/{token}`. */
export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const d = await loadStageDisplay((await ctx.params).token);
  if (!d) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(d, { headers: { "cache-control": "no-store" } });
}
