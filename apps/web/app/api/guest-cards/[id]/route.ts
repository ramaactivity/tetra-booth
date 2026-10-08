import { BIZ_CARDS, bizCardSvg } from "@/lib/biz-card";

/** Thumbnail SVG satu desain kartu QR (#225) dengan data contoh, tanpa bleed. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!BIZ_CARDS.some((c) => c.id === id)) return new Response("not found", { status: 404 });
  const svg = bizCardSvg(
    id,
    {
      name: "Rina & Dimas",
      date: "2026-12-12",
      tagline: "The Wedding of",
      url: "https://booth.tetraphoto.com/c/contoh",
      shots: 15,
    },
    false,
  );
  return new Response(svg, {
    headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" },
  });
}
