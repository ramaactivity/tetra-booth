import { BIZ_CARDS } from "@/lib/biz-card";

/**
 * Katalog desain kartu QR Guest Cam ukuran kartu nama (#225, kontrak Ops v0.9): dipakai portal klien Ops untuk
 * pilihan desain. Publik; `preview_url` = SVG dengan data contoh (bisa langsung dipakai di <img>).
 */
export function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json(
    {
      size_mm: { width: 90, height: 55, bleed: 3 },
      designs: BIZ_CARDS.map((c) => ({
        id: c.id,
        name: c.name,
        preview_url: `${origin}/api/guest-cards/${c.id}`,
      })),
    },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
