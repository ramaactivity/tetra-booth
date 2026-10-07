import { apiError } from "@/lib/booth";
import { guestEvent, guestInfo } from "@/lib/guest-cam";

type Ctx = { params: Promise<{ token: string }> };

/** Info event untuk halaman Guest Cam (#197). Publik; 404 kalau Guest Cam mati, link dicabut, atau kedaluwarsa. */
export async function GET(_req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  return Response.json(await guestInfo(ev));
}
