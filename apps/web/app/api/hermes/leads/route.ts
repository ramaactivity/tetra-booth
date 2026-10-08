import { z } from "zod";
import { HERMES_STATUSES, hermesOrg } from "@/lib/hermes";
import { bookingUrl, codeState, type PromoSnapshot } from "@/lib/promo";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

const Query = z.object({
  since: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(HERMES_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/**
 * Lead sales dari halaman tamu (#215) untuk Hermes: tamu yang meninggalkan nomor WA dan menyetujui dihubungi.
 * Urut paling lama dulu; `since` = created_at > nilai itu (pakai created_at item terakhir untuk halaman berikutnya).
 */
export async function GET(req: Request) {
  const org = hermesOrg(req);
  if (!org) return Response.json({ error: "unauthorized" }, { status: 401 });
  const q = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!q.success) return Response.json({ error: "bad_request" }, { status: 400 });
  let sel = createServiceClient()
    .from("leads")
    .select(
      "id, data, created_at, consent_at, promo_code, promo, promo_expires_at, promo_rejected_at, redeemed_at, proof_kind, proof_key, proof_check, contact_status, contacted_at, events(name, event_date, location)",
    )
    .eq("organization_id", org)
    .eq("kind", "sales")
    .order("created_at")
    .limit(q.data.limit);
  if (q.data.since) sel = sel.gt("created_at", q.data.since);
  if (q.data.status) sel = sel.eq("contact_status", q.data.status);
  const { data, error } = await sel;
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  return Response.json({
    leads: await Promise.all(
      (data ?? []).map(async (l) => {
        const snap = l.promo as PromoSnapshot | null;
        return {
          id: l.id,
          whatsapp: (l.data as { whatsapp?: string }).whatsapp ?? null,
          created_at: l.created_at,
          consent_at: l.consent_at,
          event: l.events
            ? { name: l.events.name, date: l.events.event_date, location: l.events.location }
            : null,
          promo_code: l.promo_code,
          promo_reward: snap?.label ?? null,
          promo_state: l.promo_code ? codeState(l) : null,
          promo_expires_at: l.promo_expires_at,
          booking_url: l.promo_code ? bookingUrl(l.promo_code) : null,
          proof: l.proof_kind,
          // #219: screenshot bukti (link 24 jam) + hasil pemeriksaan AI/Bruno/owner.
          proof_url: l.proof_key ? await presignGet(l.proof_key, 86_400) : null,
          proof_check: l.proof_check,
          status: l.contact_status,
          contacted_at: l.contacted_at,
        };
      }),
    ),
  });
}
