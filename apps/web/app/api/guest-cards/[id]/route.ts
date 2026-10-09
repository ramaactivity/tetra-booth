import { businessCardSvgs, CARD_DESIGNS, SAMPLE_CARD, tableCardSvg } from "@/lib/guest-card-art";

/** Thumbnail SVG satu desain kartu QR (#227) dengan data contoh: kartu meja, atau `?side=card` depan kartu nama. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!CARD_DESIGNS.some((c) => c.id === id)) return new Response("not found", { status: 404 });
  const card = new URL(req.url).searchParams.get("side") === "card";
  return new Response(
    card ? businessCardSvgs(id, SAMPLE_CARD).front : tableCardSvg(id, SAMPLE_CARD),
    {
      headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
    },
  );
}
