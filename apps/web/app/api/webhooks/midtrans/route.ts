import { midtransSignatureOk, refreshPayment } from "@/lib/payments";
import { createServiceClient } from "@/lib/supabase/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Notifikasi Midtrans (HTTP notification, DECISIONS #93): verifikasi `signature_key`, cari pembayaran dari `order_id`
 * (= id kita), lalu status dicek ulang ke API Midtrans (isi notifikasi tidak dipercaya). Idempotent.
 */
export async function POST(req: Request) {
  const key = process.env.MIDTRANS_SERVER_KEY;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!key || !body || !midtransSignatureOk(body, key))
    return new Response("unauthorized", { status: 401 });
  const id = String(body.order_id ?? "");
  if (!UUID.test(id)) return Response.json({ ok: true, ignored: true });
  const { data: p } = await createServiceClient()
    .from("payments")
    .select("id, status, provider_ref, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!p) return Response.json({ ok: true, ignored: true });
  return Response.json({ ok: true, status: await refreshPayment(p) });
}
