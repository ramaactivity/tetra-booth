import { cardDesign } from "@/lib/guest-card-art";

/** Thumbnail lama (#227) → gambar preview konsep (#230); id lama ikut dipetakan. `?side=card` = depan kartu nama. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const url = new URL(req.url);
  const face = url.searchParams.get("side") === "card" ? "front" : "a5";
  return Response.redirect(
    `${url.origin}/snapbook/cards/${cardDesign((await ctx.params).id)}-${face}.jpg`,
    308,
  );
}
