import { apiError, authDevice } from "@/lib/booth";
import { refreshPayment } from "@/lib/payments";
import { createServiceClient } from "@/lib/supabase/service";

const WEBHOOK_GRACE_MS = 20_000;

/** Status tagihan, dipoll booth tiap 2 dtk. Masih pending > 20 dtk (webhook belum datang) → cek langsung ke provider. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const { id } = await params;
  const { data: p } = await createServiceClient()
    .from("payments")
    .select("id, status, provider_ref, expires_at, created_at")
    .eq("id", id)
    .eq("device_id", device.id)
    .eq("organization_id", device.organizationId)
    .maybeSingle();
  if (!p) return apiError("not_found", 404);
  const stale =
    Date.now() - new Date(p.created_at).getTime() > WEBHOOK_GRACE_MS ||
    Date.now() > new Date(p.expires_at).getTime();
  const status = p.status === "pending" && stale ? await refreshPayment(p) : p.status;
  return Response.json({ status });
}
