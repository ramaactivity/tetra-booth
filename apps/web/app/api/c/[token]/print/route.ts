import { type GuestPrintInfo, GuestPrintRequest } from "@tetra/shared";
import { apiError, clientIp, parseBody, rateOk } from "@/lib/booth";
import { guestDesignById, guestEvent, guestPrint, guestSession } from "@/lib/guest-cam";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ token: string }> };

/** Status cetak tamu ini (#223), di-poll HP selama antre. */
export async function GET(_req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const s = await guestSession(ev);
  if (!s) return apiError("unauthorized", 401);
  return Response.json((await guestPrint(ev, s.id)) satisfies GuestPrintInfo);
}

/**
 * Tamu mencetak satu frame (#223): frame harus sudah terkirim ke album (strip_web idx), desainnya boleh dicetak.
 * Satu tamu satu cetak; kirim ulang = status yang sama (idempoten).
 */
export async function POST(req: Request, ctx: Ctx) {
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  const s = await guestSession(ev);
  if (!s) return apiError("unauthorized", 401);
  if (!ev.cam.print || !ev.cam.strip) return apiError("not_found", 404);
  if (!(await rateOk(`gprint:${clientIp(req)}`, 600, 30))) return apiError("rate_limited", 429);
  const body = await parseBody(req, GuestPrintRequest);
  if (!body) return apiError("bad_request", 400);
  const existing = await guestPrint(ev, s.id);
  if (existing) return Response.json(existing satisfies GuestPrintInfo);
  const design = await guestDesignById(ev, body.designId);
  if (!design?.printable) return apiError("bad_request", 400);
  const db = createServiceClient();
  const { data: frame } = await db
    .from("assets")
    .select("r2_key")
    .eq("organization_id", ev.organization_id)
    .eq("session_id", s.id)
    .eq("kind", "strip_web")
    .eq("idx", body.idx)
    .maybeSingle();
  if (!frame) return apiError("bad_request", 400);
  const { count } = await db
    .from("guest_prints")
    .select("id", { count: "exact", head: true })
    .eq("event_id", ev.id);
  const { error } = await db.from("guest_prints").insert({
    organization_id: ev.organization_id,
    event_id: ev.id,
    session_id: s.id,
    number: (count ?? 0) + 1,
    guest_name: s.group_name,
    r2_key: frame.r2_key,
    layout: design.layout,
    paper: design.layout.paper,
  });
  // Dua ketukan bersamaan: unik per sesi → kembalikan yang sudah ada.
  if (error && error.code !== "23505") return apiError("server_error", 500);
  return Response.json((await guestPrint(ev, s.id)) satisfies GuestPrintInfo);
}
