import { PHOTO_FILTER_IDS } from "@tetra/shared";
import { apiError } from "@/lib/booth";
import { guestEvent, guestRevealed } from "@/lib/guest-cam";

type Ctx = { params: Promise<{ token: string }> };

/** Info event untuk halaman Guest Cam (#197). Publik; 404 kalau Guest Cam mati, link dicabut, atau kedaluwarsa. */
export async function GET(_req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const filters = ((ev.settings as { filters?: string[] } | null)?.filters ?? []).filter((f) =>
    (PHOTO_FILTER_IDS as readonly string[]).includes(f),
  );
  return Response.json({
    name: ev.name,
    date: ev.event_date,
    branding: ev.branding,
    filters: filters.length ? ["normal", ...filters.filter((f) => f !== "normal")] : ["normal"],
    shots: ev.cam.shots,
    reveal: ev.cam.reveal,
    voice: ev.cam.voice,
    strip: ev.cam.strip,
    consentText: ev.cam.consentText,
    revealed: guestRevealed(ev),
  });
}
