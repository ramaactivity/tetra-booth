import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";

/** Notifikasi Midtrans (DECISIONS #93): tanda tangan salah ditolak; benar tapi order tidak dikenal = diabaikan. */
test("webhook midtrans memverifikasi signature_key", async ({ request }) => {
  const n = { order_id: "bukan-uuid", status_code: "200", gross_amount: "35000.00" };
  const sig = createHash("sha512")
    .update(`${n.order_id}${n.status_code}${n.gross_amount}SB-Mid-server-e2e`)
    .digest("hex");
  const bad = await request.post("/api/webhooks/midtrans", { data: { ...n, signature_key: "x" } });
  expect(bad.status()).toBe(401);
  const ok = await request.post("/api/webhooks/midtrans", { data: { ...n, signature_key: sig } });
  expect(ok.status()).toBe(200);
  expect(await ok.json()).toEqual({ ok: true, ignored: true });
});
