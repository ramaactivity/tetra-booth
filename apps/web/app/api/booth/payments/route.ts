import { PaymentCreateRequest } from "@tetra/shared";
import { apiError, authDevice, type Device, deviceEvents, parseBody } from "@/lib/booth";
import {
  type PaymentProvider,
  type PhotoboxSettings,
  paymentProvider,
  priceFor,
} from "@/lib/payments";
import { createServiceClient } from "@/lib/supabase/service";
import { redeemVoucher } from "@/lib/vouchers";

const EXPIRES_MS = 5 * 60_000;

/** Buat tagihan QRIS (TSD §8): harga dihitung dari pengaturan event, QR berlaku 5 menit. */
export async function POST(req: Request) {
  const device = await authDevice(req);
  if (!device) return apiError("unauthorized", 401);
  const r = await parseBody(req, PaymentCreateRequest);
  if (!r) return apiError("bad_request", 400);
  const db = createServiceClient();
  const ev = (await deviceEvents(device, { eventId: r.eventId }).catch(() => []))[0];
  if (!ev || ev.mode !== "photobox") return apiError("not_found", 404);
  const amount = priceFor(
    ev.settings as { photobox?: PhotoboxSettings; maxPrints?: number },
    r.layoutId,
    r.extraPrints,
  );
  if (amount === null) return apiError("bad_request", 400);
  const provider = paymentProvider();
  const expiresAt = new Date(Date.now() + EXPIRES_MS);
  if (r.voucherCode) return withVoucher(r, ev, device, amount, provider, expiresAt);
  if (!provider) return apiError("payment_unavailable", 503);

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

/**
 * Paket dengan voucher: potongan & kuota dicek server (`redeemVoucher`), sisa dibayar QRIS; sisa 0 = langsung lunas.
 * Event harus menyalakan "Terima voucher". Dipanggil ulang untuk sesi yang sama = tagihan yang sama (idempotent).
 */
async function withVoucher(
  r: PaymentCreateRequest,
  ev: { id: string; settings: unknown },
  device: Device,
  price: number,
  provider: PaymentProvider | null,
  expiresAt: Date,
) {
  if (r.extraPrints) return apiError("bad_request", 400);
  if (!(ev.settings as { photobox?: PhotoboxSettings } | null)?.photobox?.voucher)
    return Response.json({ voucherError: "invalid" });
  const db = createServiceClient();
  const res = await redeemVoucher(db, {
    orgId: device.organizationId,
    eventId: ev.id,
    deviceId: device.id,
    sessionId: r.sessionId,
    layoutId: r.layoutId,
    code: r.voucherCode ?? "",
    price,
    provider: provider?.name ?? null,
    expiresAt,
  }).catch((e: unknown) => {
    console.error(`[payments] voucher gagal: ${String(e)}`);
    return null;
  });
  if (!res) return apiError("server_error", 500);
  if ("voucherError" in res) return Response.json(res);
  if ("unavailable" in res) return apiError("payment_unavailable", 503);
  const pay = res.payment;
  const bill = (qrString: string) =>
    Response.json({
      paymentId: pay.id,
      qrString,
      amount: pay.amount_idr,
      expiresAt: pay.expires_at,
      discount: pay.discount_idr,
    });
  if (pay.status === "paid" || pay.qr_string) return bill(pay.qr_string ?? "");
  if (!provider) return apiError("payment_unavailable", 503);
  // ponytail: panggilan ulang yang tiba saat QR pertama masih dibuat ikut membuat QR (Xendit idempotent per id,
  // Midtrans menolak order_id ganda → tagihan gagal, tamu menekan Coba lagi). Booth tidak mengirim bersamaan.
  try {
    const qr = await provider.create({
      referenceId: pay.id,
      amount: pay.amount_idr,
      expiresAt: new Date(pay.expires_at),
    });
    await db
      .from("payments")
      .update({ provider_ref: qr.ref, qr_string: qr.qrString })
      .eq("id", pay.id);
    return bill(qr.qrString);
  } catch (e) {
    console.error(`[payments] buat QRIS voucher ${pay.id} gagal: ${String(e)}`);
    await db.from("payments").update({ status: "failed" }).eq("id", pay.id);
    return apiError("payment_unavailable", 503);
  }
}
