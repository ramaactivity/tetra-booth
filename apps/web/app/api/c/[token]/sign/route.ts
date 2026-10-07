import { GuestSignRequest, type GuestSignResponse, guestParts, idxAllowed } from "@tetra/shared";
import { apiError, clientIp, parseBody, rateOk } from "@/lib/booth";
import { guestEvent, guestKey, guestSession } from "@/lib/guest-cam";
import { presignPut } from "@/lib/r2";

type Ctx = { params: Promise<{ token: string }> };

/** URL PUT R2 untuk satu unggahan tamu (#197). Jatah ditegakkan lewat rentang idx; kirim ulang idx sama = menimpa. */
export async function POST(req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const s = await guestSession(ev);
  if (!s) return apiError("unauthorized", 401);
  if (
    !(await rateOk(`gsign:${s.id}`, 600, 150)) ||
    !(await rateOk(`gip:${clientIp(req)}`, 600, 600))
  )
    return apiError("rate_limited", 429);
  const body = await parseBody(req, GuestSignRequest);
  if (!body || !idxAllowed(ev.cam, body.kind, body.idx)) return apiError("bad_request", 400);
  const uploads = await Promise.all(
    guestParts(body.kind, body.audioType).map(async (p) => ({
      part: p.part as "main" | "thumb",
      contentType: p.contentType,
      url: await presignPut(guestKey(ev, s.id, p.kind, body.idx, p.ext), p.contentType),
    })),
  );
  return Response.json({ uploads } satisfies GuestSignResponse);
}
