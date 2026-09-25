import { SESSION_ID_PATTERN } from "@tetra/shared";
import { z } from "zod";
import { apiError, clientIp, rateOk } from "@/lib/booth";
import { LEAD_VALUE, leadCapture } from "@/lib/leads";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ data: z.record(z.string(), z.string()), consent: z.literal(true) });

/**
 * Lead dari halaman tamu (FSD §2, TSD §7). Publik, rate limit per IP. Field sesuai pengaturan event, semua wajib;
 * persetujuan wajib dan dicatat dengan versi teksnya. Satu lead per sesi (kirim ulang = ok tanpa baris baru).
 */
export async function POST(req: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!(await rateOk(`lead:${clientIp(req)}`, 600, 20))) return apiError("rate_limited", 429);
  const { sessionId } = await params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!SESSION_ID_PATTERN.test(sessionId) || !body.success) return apiError("bad_request", 400);
  const db = createServiceClient();
  const { data: s } = await db
    .from("sessions")
    .select("id, organization_id, event_id, events!inner(lead_capture)")
    .eq("id", sessionId)
    .maybeSingle();
  const cfg = leadCapture(s?.events.lead_capture);
  if (!s || !cfg) return apiError("not_found", 404);

  const data: Record<string, string> = {};
  for (const f of cfg.fields) {
    const v = LEAD_VALUE[f].safeParse(body.data.data[f] ?? "");
    if (!v.success) return apiError("bad_request", 400);
    data[f] = v.data;
  }
  const { count } = await db
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("session_id", s.id)
    .eq("organization_id", s.organization_id);
  if (!count) {
    const { error } = await db.from("leads").insert({
      organization_id: s.organization_id,
      event_id: s.event_id,
      session_id: s.id,
      data,
      consent_version: cfg.consentVersion,
      consent_at: new Date().toISOString(),
    });
    if (error) return apiError("server_error", 500);
  }
  return Response.json({ ok: true });
}
