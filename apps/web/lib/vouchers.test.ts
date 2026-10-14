import { describe, expect, it, vi } from "vitest";
import { normalizeCode, redeemVoucher, voucherPrice } from "./vouchers";

describe("voucherPrice: sisa bayar dihitung server", () => {
  it("nominal & persen memotong harga paket; potongan + sisa = harga", () => {
    expect(voucherPrice(35000, { kind: "amount", value: 10000 })).toEqual({
      amount: 25000,
      discount: 10000,
    });
    expect(voucherPrice(35000, { kind: "percent", value: 20 })).toEqual({
      amount: 28000,
      discount: 7000,
    });
    // Persen pecahan rupiah: potongan dibulatkan ke bawah (tanpa desimal).
    expect(voucherPrice(33333, { kind: "percent", value: 10 })).toEqual({
      amount: 30000,
      discount: 3333,
    });
  });
  it("voucher ≥ harga atau 100% → gratis (tanpa QRIS), tidak pernah minus", () => {
    expect(voucherPrice(25000, { kind: "amount", value: 50000 })).toEqual({
      amount: 0,
      discount: 25000,
    });
    expect(voucherPrice(25000, { kind: "percent", value: 100 })).toEqual({
      amount: 0,
      discount: 25000,
    });
  });
  it("sisa di bawah minimum QRIS (Rp 1.500) dinaikkan ke minimum, bukan digratiskan", () => {
    expect(voucherPrice(25000, { kind: "amount", value: 24000 })).toEqual({
      amount: 1500,
      discount: 23500,
    });
  });
  it("kode diketik bebas → huruf besar tanpa spasi", () => {
    expect(normalizeCode(" mall-10 k ")).toBe("MALL10K");
  });
});

/** Klien Supabase palsu: satu voucher di tabel, `rpc` mengembalikan `rpcResult`. */
function fakeDb(
  voucher: object | null,
  rpcResult: { data?: unknown; error?: { message: string } },
) {
  const eqs: [string, unknown][] = [];
  const q = {
    select: () => q,
    eq: (k: string, v: unknown) => {
      eqs.push([k, v]);
      return q;
    },
    maybeSingle: async () => ({ data: voucher }),
  };
  const rpc = vi.fn(async () => ({ data: rpcResult.data ?? null, error: rpcResult.error ?? null }));
  return { db: { from: () => q, rpc } as never, rpc, eqs };
}
const req = {
  orgId: "org-1",
  eventId: "ev-1",
  deviceId: "dev-1",
  sessionId: "sesi00001",
  layoutId: "strip-3",
  code: "mall10",
  price: 25000,
  provider: "midtrans",
  expiresAt: new Date("2026-10-14T10:00:00Z"),
};

describe("redeemVoucher", () => {
  it("cari kode di organisasi device, kirim nominal hasil server ke redeem_voucher", async () => {
    const { db, rpc, eqs } = fakeDb(
      { id: "v1", kind: "amount", value: 10000 },
      { data: { id: "p1" } },
    );
    expect(await redeemVoucher(db, req)).toEqual({ payment: { id: "p1" } });
    expect(eqs).toEqual([
      ["organization_id", "org-1"],
      ["code", "MALL10"],
    ]);
    expect(rpc).toHaveBeenCalledWith(
      "redeem_voucher",
      expect.objectContaining({
        p_org: "org-1",
        p_voucher: "v1",
        p_amount: 15000,
        p_discount: 10000,
        p_provider: "midtrans",
        p_session: "sesi00001",
      }),
    );
  });
  it("voucher 100%: provider 'voucher', tetap jalan walau QRIS belum dikonfigurasi", async () => {
    const { db, rpc } = fakeDb({ id: "v1", kind: "percent", value: 100 }, { data: { id: "p1" } });
    await redeemVoucher(db, { ...req, provider: null });
    expect(rpc).toHaveBeenCalledWith(
      "redeem_voucher",
      expect.objectContaining({ p_amount: 0, p_discount: 25000, p_provider: "voucher" }),
    );
  });
  it("sisa > 0 tanpa provider → unavailable, voucher tidak dipakai", async () => {
    const { db, rpc } = fakeDb({ id: "v1", kind: "amount", value: 1000 }, {});
    expect(await redeemVoucher(db, { ...req, provider: null })).toEqual({ unavailable: true });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("kode tidak dikenal / ditolak SQL → alasan untuk layar booth", async () => {
    expect(await redeemVoucher(fakeDb(null, {}).db, req)).toEqual({ voucherError: "invalid" });
    const used = fakeDb(
      { id: "v1", kind: "amount", value: 1000 },
      { error: { message: "voucher_used_up" } },
    );
    expect(await redeemVoucher(used.db, req)).toEqual({ voucherError: "used_up" });
    const boom = fakeDb({ id: "v1", kind: "amount", value: 1000 }, { error: { message: "x" } });
    await expect(redeemVoucher(boom.db, req)).rejects.toThrow(/redeem_voucher/);
  });
});
