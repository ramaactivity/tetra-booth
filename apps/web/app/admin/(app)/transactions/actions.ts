"use server";
import { revalidatePath } from "next/cache";
import { paymentProvider, refreshPayment } from "@/lib/payments";
import { requireMember } from "@/lib/supabase/server";

/** Mode test: tandai tagihan pending lunas lewat simulasi provider (uji booth tanpa dompet digital). */
export async function simulatePay(paymentId: string) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const provider = paymentProvider();
  if (!provider?.simulate) return;
  const { data: p } = await db
    .from("payments")
    .select("id, status, provider_ref, expires_at, amount_idr")
    .eq("id", paymentId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!p?.provider_ref || p.status !== "pending") return;
  await provider.simulate(p.provider_ref, p.amount_idr);
  await refreshPayment(p);
  revalidatePath("/admin/transactions");
}
