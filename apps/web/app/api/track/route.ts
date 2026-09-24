import { TrackRequest } from "@tetra/shared";
import { apiError, clientIp, parseBody, rateOk } from "@/lib/booth";
import { createServiceClient } from "@/lib/supabase/service";

/** Analytics halaman tamu: qr_open, save, save_all → analytics_events (organisasi & event dari sesi). */
export async function POST(req: Request) {
  if (!(await rateOk(`track:${clientIp(req)}`, 60, 60))) return apiError("rate_limited", 429);
  const body = await parseBody(req, TrackRequest);
  if (!body) return apiError("bad_request", 400);
  const db = createServiceClient();
  const { data: s } = await db
    .from("sessions")
    .select("id, organization_id, event_id")
    .eq("id", body.sessionId)
    .maybeSingle();
  if (!s) return apiError("not_found", 404);
  const { error } = await db.from("analytics_events").insert({
    organization_id: s.organization_id,
    event_id: s.event_id,
    session_id: s.id,
    type: body.type,
  });
  if (error) return apiError("server_error", 500);
  return new Response(null, { status: 204 });
}
