import { apiError } from "@/lib/booth";
import { guestEvent, guestMe, guestSession } from "@/lib/guest-cam";

type Ctx = { params: Promise<{ token: string }> };

/** Isi milik tamu ini (#197): sisa jatah, idx terpakai, foto kalau sudah boleh dilihat. 401 = belum join. */
export async function GET(_req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const s = await guestSession(ev);
  if (!s) return apiError("unauthorized", 401);
  return Response.json(await guestMe(ev, s));
}
