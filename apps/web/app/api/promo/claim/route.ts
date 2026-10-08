import { z } from "zod";
import { apiError, clientIp, rateOk } from "@/lib/booth";
import { loadPromo, PROOFS, promoCode } from "@/lib/promo";
import { putObject } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

const Fields = z.object({ id: z.uuid(), kind: z.enum(PROOFS) });
const MAX = 4 * 1024 * 1024;

/**
 * Klaim promo tamu (#215): screenshot bukti (story yang men-tag / ulasan Google) → kode unik. Bukti tidak diperiksa
 * otomatis; admin melihatnya di /admin/promo sebelum kode dipakai. Klaim ulang = kode yang sama.
 */
export async function POST(req: Request) {
  if (!(await rateOk(`promo-claim:${clientIp(req)}`, 600, 10)))
    return apiError("rate_limited", 429);
  const form = await req.formData().catch(() => null);
  const f = Fields.safeParse({ id: form?.get("id"), kind: form?.get("kind") });
  const file = form?.get("file");
  if (!f.success || !(file instanceof File) || !file.type.startsWith("image/") || file.size > MAX)
    return apiError("bad_request", 400);
  const db = createServiceClient();
  const { data: lead } = await db
    .from("leads")
    .select("id, organization_id, event_id, promo_code")
    .eq("id", f.data.id)
    .eq("kind", "sales")
    .maybeSingle();
  if (!lead) return apiError("not_found", 404);
  if (lead.promo_code) return Response.json({ code: lead.promo_code });
  const promo = await loadPromo(lead.event_id);
  if (!promo?.offer?.proofs.includes(f.data.kind)) return apiError("not_found", 404);
  const key = `${lead.organization_id}/promo/${lead.id}.${file.type === "image/png" ? "png" : "jpg"}`;
  await putObject(key, new Uint8Array(await file.arrayBuffer()), file.type);
  const code = promoCode();
  const { error } = await db
    .from("leads")
    .update({ proof_kind: f.data.kind, proof_key: key, promo_code: code })
    .eq("id", lead.id)
    .eq("organization_id", lead.organization_id)
    .is("promo_code", null);
  if (error) return apiError("server_error", 500);
  // Dua klaim bersamaan: yang menang menulis kodenya, keduanya membalas kode yang tersimpan.
  const { data: saved } = await db.from("leads").select("promo_code").eq("id", lead.id).single();
  return Response.json({ code: saved?.promo_code ?? code });
}
