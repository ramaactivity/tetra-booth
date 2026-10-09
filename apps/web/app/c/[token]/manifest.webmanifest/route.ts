import { guestEvent } from "@/lib/guest-cam";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Manifest web app Guest Cam per acara (#211): tamu iPhone bisa "Tambah ke Layar Utama" lalu membuka kamera
 * layar penuh tanpa bar Safari, langsung ke acara yang sama. Android memakai Fullscreen API (tanpa ajakan install).
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const ev = await guestEvent(token);
  const start = `/c/${token}`;
  return Response.json(
    {
      name: ev ? `Snapbook · ${ev.name}` : "Snapbook",
      short_name: "Snapbook",
      start_url: start,
      scope: start,
      id: start,
      display: "fullscreen",
      display_override: ["fullscreen", "standalone"],
      orientation: "portrait",
      background_color: "#F8D98B",
      theme_color: "#000000",
      icons: [
        { src: "/guest-cam/icon-192.png", sizes: "192x192", type: "image/png" },
        {
          src: "/guest-cam/icon-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "any maskable",
        },
      ],
    },
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}
