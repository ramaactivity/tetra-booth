import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
const { midtrans, midtransSignatureOk } = await import("./payments");

const KEY = "Mid-server-test"; // key sandbox akun baru: tanpa awalan "SB-" (#95)
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("Midtrans QRIS (DECISIONS #93)", () => {
  it("charge QRIS ke sandbox: order_id = id kita, auth Basic, qr_string dikembalikan", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) =>
      reply({ status_code: "201", transaction_status: "pending", qr_string: "00020101QRIS" }),
    );
    vi.stubGlobal("fetch", f);
    const r = await midtrans(KEY).create({
      referenceId: "11111111-2222-3333-4444-555555555555",
      amount: 35000,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    expect(r).toEqual({ ref: "11111111-2222-3333-4444-555555555555", qrString: "00020101QRIS" });
    const [url, init] = f.mock.calls[0] ?? [];
    expect(url).toBe("https://api.sandbox.midtrans.com/v2/charge");
    expect((init?.headers as Record<string, string> | undefined)?.Authorization).toBe(
      `Basic ${Buffer.from(`${KEY}:`).toString("base64")}`,
    );
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      payment_type: "qris",
      transaction_details: {
        order_id: "11111111-2222-3333-4444-555555555555",
        gross_amount: 35000,
      },
      custom_expiry: { expiry_duration: 5, unit: "minute" },
    });
  });

  it("status: settlement = paid, expire = expired, deny = failed; status_code 404 dalam HTTP 200 = error", async () => {
    const mt = midtrans("Mid-server-prod", true);
    for (const [s, want] of [
      ["settlement", "paid"],
      ["pending", "pending"],
      ["expire", "expired"],
      ["deny", "failed"],
    ] as const) {
      vi.stubGlobal("fetch", async () => reply({ status_code: "200", transaction_status: s }));
      expect(await mt.status("x")).toBe(want);
    }
    vi.stubGlobal("fetch", async (u: string) => {
      expect(u).toBe("https://api.midtrans.com/v2/x/status");
      return reply({ status_code: "404", status_message: "Transaction doesn't exist." });
    });
    await expect(mt.status("x")).rejects.toThrow(/404/);
  });

  it("tanda tangan notifikasi: SHA-512(order_id + status_code + gross_amount + server key)", () => {
    const n = { order_id: "abc", status_code: "200", gross_amount: "35000.00" };
    const sig = createHash("sha512").update(`abc20035000.00${KEY}`).digest("hex");
    expect(midtransSignatureOk({ ...n, signature_key: sig }, KEY)).toBe(true);
    expect(midtransSignatureOk({ ...n, gross_amount: "1.00", signature_key: sig }, KEY)).toBe(
      false,
    );
    expect(midtransSignatureOk({ ...n, signature_key: "x" }, KEY)).toBe(false);
  });
});
