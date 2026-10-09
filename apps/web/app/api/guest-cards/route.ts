import { CARD_DESIGNS } from "@/lib/guest-card-art";

/**
 * Katalog konsep kartu QR Snapbook (#225/#230, kontrak Ops v0.9): dipakai portal klien Ops untuk pilihan desain.
 * Publik. Preview = gambar jadi dari desainer (data contoh): kartu meja A5, depan & belakang kartu nama.
 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const img = (id: string, face: string) => `${origin}/snapbook/cards/${id}-${face}.jpg`;
  return Response.json(
    {
      size_mm: { width: 90, height: 55, bleed: 3 },
      table_sizes: ["a5", "a6"],
      designs: CARD_DESIGNS.map((c) => ({
        id: c.id,
        name: c.name,
        hint: c.hint,
        preview_url: img(c.id, "a5"),
        card_preview_url: img(c.id, "front"),
        card_back_preview_url: img(c.id, "back"),
      })),
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
