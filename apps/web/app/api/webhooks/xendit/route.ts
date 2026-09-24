import { timingSafeEqual } from "node:crypto";
import { refreshPayment } from "@/lib/payments";
import { createServiceClient } from "@/lib/supabase/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tokenOk = (got: string | null) => {
  const want = process.env.XENDIT_CALLBACK_TOKEN;
  if (!want || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Webhook Xendit (TSD §7): verifikasi `x-callback-token`, cari pembayaran dari `reference_id` (= id kita), lalu status
 * dicek ulang ke API Xendit (isi webhook tidak dipercaya). Idempotent: hanya pending yang berubah.
 */
export async function POST(req: Request) {
  if (!tokenOk(req.headers.get("x-callback-token")))
    return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => null)) as {
    data?: { reference_id?: unknown };
    reference_id?: unknown;
  } | null;
  const ref = String(body?.data?.reference_id ?? body?.reference_id ?? "");
  if (!UUID.test(ref)) return Response.json({ ok: true, ignored: true });
  const { data: p } = await createServiceClient()
    .from("payments")
    .select("id, status, provider_ref, expires_at")
    .eq("id", ref)
    .maybeSingle();
  if (!p) return Response.json({ ok: true, ignored: true });
  return Response.json({ ok: true, status: await refreshPayment(p) });
}
