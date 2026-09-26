import { apiError, authDevice } from "@/lib/booth";
import { paymentProvider, refreshPayment } from "@/lib/payments";
import { createServiceClient } from "@/lib/supabase/service";

/** Uji tanpa dompet digital: bayar tagihan lewat simulasi provider (Xendit mode test / Midtrans sandbox / provider palsu). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const provider = paymentProvider();
  if (!provider?.simulate) return apiError("not_found", 404);
  const { id } = await params;
  const { data: p } = await createServiceClient()
    .from("payments")
    .select("id, status, provider_ref, expires_at, amount_idr")
    .eq("id", id)
    .eq("device_id", device.id)
    .eq("organization_id", device.organizationId)
    .maybeSingle();
  if (!p?.provider_ref) return apiError("not_found", 404);
  await provider.simulate(p.provider_ref, p.amount_idr);
  return Response.json({ status: await refreshPayment(p) });
}
