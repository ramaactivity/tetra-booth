import type { Database } from "@tetra/db";
import type { VoucherError } from "@tetra/shared";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * Voucher photobox: memotong harga paket; sisa dibayar QRIS, sisa 0 = langsung lunas tanpa QRIS.
 * Hitungan nominal hanya di sini (server); kuota & masa berlaku dicek atomik di SQL `redeem_voucher` (0034).
 */

/** Tagihan QRIS terkecil (DECISIONS #70): sisa di bawah ini dinaikkan ke minimum, tidak digratiskan. */
export const QRIS_MIN_IDR = 1500;

export type VoucherValue = { kind: "amount" | "percent"; value: number };

/** Harga setelah voucher: `amount` = yang dibayar tamu (0 atau ≥ QRIS_MIN_IDR), `discount` = potongan. */
export function voucherPrice(price: number, v: VoucherValue): { amount: number; discount: number } {
  const off = v.kind === "percent" ? Math.floor((price * Math.min(v.value, 100)) / 100) : v.value;
  let amount = Math.max(0, price - off);
  if (amount > 0 && amount < QRIS_MIN_IDR) amount = Math.min(price, QRIS_MIN_IDR);
  return { amount, discount: price - amount };
}

/** Kode yang diketik admin/tamu → bentuk tersimpan (huruf besar, tanpa spasi/tanda). */
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Teks nilai voucher untuk admin: "Rp 10.000" / "20%". */
export const voucherLabel = (v: VoucherValue) =>
  v.kind === "percent" ? `${v.value}%` : `Rp ${v.value.toLocaleString("id-ID")}`;

type Db = ReturnType<typeof createServiceClient>;
type Payment = Database["public"]["Tables"]["payments"]["Row"];

/**
 * Tukar voucher untuk paket sesi booth: cari kode di organisasi device, hitung sisa bayar, lalu `redeem_voucher`
 * (kunci baris voucher → cek berlaku & kuota → catat payment; panggilan ulang sesi yang sama = payment yang sama).
 * `provider` = nama provider QRIS untuk sisa > 0; null = belum dikonfigurasi (sisa > 0 → `unavailable`).
 */
export async function redeemVoucher(
  db: Db,
  r: {
    orgId: string;
    eventId: string;
    deviceId: string;
    sessionId: string;
    layoutId: string;
    code: string;
    price: number;
    provider: string | null;
    expiresAt: Date;
  },
): Promise<{ payment: Payment } | { voucherError: VoucherError } | { unavailable: true }> {
  const { data: v } = await db
    .from("vouchers")
    .select("id, kind, value")
    .eq("organization_id", r.orgId)
    .eq("code", normalizeCode(r.code))
    .maybeSingle();
  if (!v || (v.kind !== "amount" && v.kind !== "percent")) return { voucherError: "invalid" };
  const { amount, discount } = voucherPrice(r.price, { kind: v.kind, value: v.value });
  if (amount > 0 && !r.provider) return { unavailable: true };
  const { data, error } = await db.rpc("redeem_voucher", {
    p_org: r.orgId,
    p_voucher: v.id,
    p_kind: v.kind,
    p_value: v.value,
    p_event: r.eventId,
    p_device: r.deviceId,
    p_session: r.sessionId,
    p_layout: r.layoutId,
    p_amount: amount,
    p_discount: discount,
    p_provider: amount ? (r.provider ?? "") : "voucher",
    p_expires: r.expiresAt.toISOString(),
  });
  if (error) {
    const code = /voucher_(invalid|expired|used_up)/.exec(error.message)?.[1];
    if (code) return { voucherError: code as VoucherError };
    throw new Error(`redeem_voucher: ${error.message}`);
  }
  return { payment: data as Payment };
}
