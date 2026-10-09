import { CARD_DESIGNS } from "@/lib/guest-card-art";

/**
 * Katalog desain kartu QR Kamera Tamu (#225/#227, kontrak Ops v0.9): dipakai portal klien Ops untuk pilihan desain.
 * Publik. `preview_url` = kartu meja (potret A6/A5), `card_preview_url` = depan kartu nama; SVG data contoh untuk <img>.
 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json(
    {
      size_mm: { width: 90, height: 55, bleed: 3 },
      table_sizes: ["a6", "a5"],
      designs: CARD_DESIGNS.map((c) => ({
        id: c.id,
        name: c.name,
        hint: c.hint,
        preview_url: `${origin}/api/guest-cards/${c.id}`,
        card_preview_url: `${origin}/api/guest-cards/${c.id}?side=card`,
      })),
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
