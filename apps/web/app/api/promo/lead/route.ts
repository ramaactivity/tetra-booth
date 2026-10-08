import { WhatsappSchema } from "@tetra/shared";
import { z } from "zod";
import { apiError, clientIp, rateOk } from "@/lib/booth";
import { consentVersion } from "@/lib/leads";
import { consentText, loadPromo } from "@/lib/promo";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ eventId: z.uuid(), whatsapp: WhatsappSchema, consent: z.literal(true) });

/**
 * Tamu tertarik memakai jasa org (#215): simpan nomor WA sebagai lead `sales` (ditarik Hermes). Satu nomor = satu
 * lead per org; kirim ulang mengembalikan lead yang sama (beserta kode promo kalau sudah diklaim).
 */
export async function POST(req: Request) {
  if (!(await rateOk(`promo-lead:${clientIp(req)}`, 600, 10))) return apiError("rate_limited", 429);
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!body.success) return apiError("bad_request", 400);
  const promo = await loadPromo(body.data.eventId);
  if (!promo?.whatsapp) return apiError("not_found", 404);
  const db = createServiceClient();
  const { data: ev } = await db
    .from("events")
    .select("organization_id")
    .eq("id", promo.eventId)
    .single();
  if (!ev) return apiError("not_found", 404);
  const find = () =>
    db
      .from("leads")
      .select("id, promo_code")
      .eq("organization_id", ev.organization_id)
      .eq("kind", "sales")
      .eq("data->>whatsapp", body.data.whatsapp)
      .maybeSingle();
  let { data: lead } = await find();
  if (!lead) {
    const { data, error } = await db
      .from("leads")
      .insert({
        organization_id: ev.organization_id,
        event_id: promo.eventId,
        kind: "sales",
        data: { whatsapp: body.data.whatsapp },
        consent_version: consentVersion(consentText(promo.org)),
        consent_at: new Date().toISOString(),
      })
      .select("id, promo_code")
      .single();
    // Dua kiriman bersamaan: index unik menolak yang kedua → ambil yang sudah ada.
    lead = data ?? (error?.code === "23505" ? (await find()).data : null);
  }
  if (!lead) return apiError("server_error", 500);
  return Response.json({ id: lead.id, code: lead.promo_code });
}
