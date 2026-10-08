import { WhatsappSchema } from "@tetra/shared";
import { opsCaller } from "@/lib/ops-sync";
import { CODE, codeState, PROMO_LEAD, type PromoSnapshot } from "@/lib/promo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cek kode promo tamu dari wizard booking Ops (#218, kontrak v0.8). Selalu 200 untuk kode berformat benar:
 * `valid` + `reason` (not_found | rejected | redeemed | expired). `?whatsapp=` → `whatsapp_match` (info saja).
 */
export async function GET(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const org = opsCaller(req);
  if (org instanceof Response) return org;
  const code = (await ctx.params).code.toUpperCase();
  if (!CODE.test(code)) return Response.json({ code, valid: false, reason: "not_found" });
  const { data: l } = await createServiceClient()
    .from("leads")
    .select(PROMO_LEAD)
    .eq("organization_id", org)
    .eq("kind", "sales")
    .eq("promo_code", code)
    .maybeSingle();
  if (!l?.promo) return Response.json({ code, valid: false, reason: "not_found" });
  const state = codeState(l);
  const snap = l.promo as PromoSnapshot;
  const wa = new URL(req.url).searchParams.get("whatsapp");
  const parsed = wa ? WhatsappSchema.safeParse(wa) : null;
  return Response.json({
    code,
    valid: state === "valid",
    reason: state === "valid" ? null : state,
    label: snap.label,
    discount:
      snap.discount.type === "percent"
        ? { type: "percent", value: snap.discount.value, max_idr: snap.discount.maxIdr ?? null }
        : snap.discount.type === "amount"
          ? { type: "amount", value: snap.discount.value }
          : { type: "item", item: snap.discount.item },
    min_idr: snap.minIdr,
    expires_at: l.promo_expires_at,
    redeemed_project_id: l.redeemed_project_id,
    whatsapp_match: parsed
      ? parsed.success && parsed.data === (l.data as { whatsapp?: string }).whatsapp
      : null,
  });
}
