import { PaymentCreateRequest } from "@tetra/shared";
import { apiError, authDevice, parseBody } from "@/lib/booth";
import { type PhotoboxSettings, paymentProvider, priceFor } from "@/lib/payments";
import { createServiceClient } from "@/lib/supabase/service";

const EXPIRES_MS = 5 * 60_000;

/** Buat tagihan QRIS (TSD §8): harga dihitung dari pengaturan event, QR berlaku 5 menit. */
export async function POST(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const r = await parseBody(req, PaymentCreateRequest);
  if (!r) return apiError("bad_request", 400);
  const db = createServiceClient();
  const { data: ev } = await db
    .from("events")
    .select("id, mode, settings, event_devices!inner(device_id)")
    .eq("id", r.eventId)
    .eq("organization_id", device.organizationId)
    .eq("event_devices.device_id", device.id)
    .maybeSingle();
  if (!ev || ev.mode !== "photobox") return apiError("not_found", 404);
  const amount = priceFor(
    ev.settings as { photobox?: PhotoboxSettings; maxPrints?: number },
    r.layoutId,
    r.extraPrints,
  );
  if (amount === null) return apiError("bad_request", 400);
  const provider = paymentProvider();
  if (!provider) return apiError("payment_unavailable", 503);

  const expiresAt = new Date(Date.now() + EXPIRES_MS);
  const { data: pay, error } = await db
    .from("payments")
    .insert({
      organization_id: device.organizationId,
      event_id: ev.id,
      device_id: device.id,
      layout_key: r.layoutId,
      kind: r.extraPrints ? "extra_prints" : "package",
      prints: r.extraPrints ?? 1,
      amount_idr: amount,
      provider: provider.name,
      session_id: r.sessionId,
      status: "pending",
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error || !pay) return apiError("server_error", 500);
  try {
    const qr = await provider.create({ referenceId: pay.id, amount, expiresAt });
    await db
      .from("payments")
      .update({ provider_ref: qr.ref, qr_string: qr.qrString })
      .eq("id", pay.id);
    return Response.json({
      paymentId: pay.id,
      qrString: qr.qrString,
      amount,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e) {
    console.error(`[payments] buat QRIS ${pay.id} gagal: ${String(e)}`);
    await db.from("payments").update({ status: "failed" }).eq("id", pay.id);
    return apiError("payment_unavailable", 503);
  }
}
