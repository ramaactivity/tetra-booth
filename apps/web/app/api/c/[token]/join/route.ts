import { GuestJoinRequest, newSessionId } from "@tetra/shared";
import { apiError, clientIp, parseBody, rateOk } from "@/lib/booth";
import { guestClosed, guestEvent, guestMe, guestSession, newGuestKey } from "@/lib/guest-cam";
import { consentVersion } from "@/lib/leads";
import { createServiceClient } from "@/lib/supabase/service";

type Ctx = { params: Promise<{ token: string }> };

/**
 * Tamu bergabung (#197): nama + WhatsApp/Instagram + persetujuan → sesi `guest` + lead, cookie kunci di browser.
 * Idempoten per browser: cookie yang sudah punya sesi mendapat sesi yang sama.
 */
export async function POST(req: Request, ctx: Ctx) {
  if (!(await rateOk(`gjoin:${clientIp(req)}`, 600, 30))) return apiError("rate_limited", 429);
  const ev = await guestEvent((await ctx.params).token);
  if (!ev) return apiError("not_found", 404);
  // Acara selesai (A10): tidak menerima tamu baru.
  if (guestClosed(ev)) return apiError("not_found", 404);
  const body = await parseBody(req, GuestJoinRequest);
  if (!body) return apiError("bad_request", 400);
  const existing = await guestSession(ev);
  if (existing) return Response.json(await guestMe(ev, existing));

  const db = createServiceClient();
  const now = new Date().toISOString();
  const id = newSessionId();
  const { error } = await db.from("sessions").insert({
    id,
    organization_id: ev.organization_id,
    event_id: ev.id,
    device_id: null,
    source: "guest",
    group_name: body.name,
    guest_key_hash: await newGuestKey(ev),
    started_at: now,
  });
  if (error) return apiError("server_error", 500);
  const data = Object.fromEntries(
    Object.entries({ ...body, source: "guest_cam" }).filter(([, v]) => v !== undefined),
  );
  await db.from("leads").insert({
    organization_id: ev.organization_id,
    event_id: ev.id,
    session_id: id,
    data,
    consent_version: consentVersion(ev.cam.consentText),
    consent_at: now,
  });
  return Response.json(await guestMe(ev, { id, group_name: body.name }));
}
