import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Voucher photobox terhadap cloud palsu: event menyalakan voucher → "Punya kode voucher?" di layar bayar → kode salah
 * ditolak, cloud tak terjangkau = pesan internet, kode potongan → QR sisa → lunas; sesi kedua kode 100% → langsung
 * lunas tanpa QRIS. Booth hanya mengirim kode; potongan & sisa dari server.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const EVENT = "5b1f4c2e-9d6a-4e0b-8c3f-1a2b3c4d5e6f";
const TOKEN = "p".repeat(54);
const slot = (id: string, x: number, y: number, w: number, h: number) =>
  ({ id, x, y, w, h, fit: "cover", z: "below_overlay" }) as const;
const layout = (id: string, paper: string, w: number, slots: ReturnType<typeof slot>[]) => ({
  id,
  version: 1,
  paper,
  canvas: { width: w, height: 1800, dpi: 300 },
  background: { color: "#ffffff" },
  slots,
  texts: [],
});
const strip = layout(
  "strip-3-e2e",
  "2x6x2",
  600,
  [0, 1, 2].map((i) => slot(`s${i}`, 30, 30 + i * 390, 540, 360)),
);
const grid = layout("4r-grid-e2e", "4R", 1200, [
  slot("a", 40, 40, 540, 720),
  slot("b", 620, 40, 540, 720),
]);
const CONFIG = {
  id: EVENT,
  name: "Photobox Mall",
  date: "12 Oktober 2026",
  layout: strip,
  mode: "photobox",
  photobox: {
    layouts: [
      { id: "strip-3", name: "Strip Klasik", info: "2x6 · 3 foto", price: 25000, layout: strip },
      { id: "4r-grid", name: "4R Grid", info: "4x6 · 2 foto", price: 35000, layout: grid },
    ],
    extraPrintPrice: 10000,
    voucher: true,
  },
  settings: { countdownSec: 1, shotDelaySec: 0.2, sessionSec: 180, maxPrints: 3 },
  assets: {},
};

const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

let vouchersDown = false;

test("photobox voucher: kode salah → offline → potongan + QR sisa → lunas; kode 100% → tanpa QRIS", async () => {
  test.setTimeout(180_000);
  const payments: {
    body: Record<string, unknown>;
    id: string;
    amount: number;
    polls: number;
  }[] = [];
  const sessions: Record<string, unknown>[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => {
      body += c;
    });
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const url = req.url ?? "";
      if (url === "/api/booth/pair")
        return res.end(
          JSON.stringify({
            token: TOKEN,
            deviceId: randomUUID(),
            name: "Booth Mall",
            shortCode: "B09",
          }),
        );
      if (url === "/api/booth/events")
        return res.end(
          JSON.stringify({ events: [{ id: EVENT, name: "Photobox Mall", bundleVersion: 1 }] }),
        );
      if (url === `/api/booth/events/${EVENT}/bundle`)
        return res.end(JSON.stringify({ bundleVersion: 1, config: CONFIG, files: [] }));
      if (url === "/api/booth/payments") {
        const b = JSON.parse(body) as { layoutId: string; voucherCode?: string };
        if (b.voucherCode && vouchersDown) {
          res.statusCode = 503;
          return res.end(JSON.stringify({ error: "payment_unavailable" }));
        }
        if (b.voucherCode && !["HEMAT10", "GRATIS"].includes(b.voucherCode))
          return res.end(JSON.stringify({ voucherError: "invalid" }));
        const price = b.layoutId === "4r-grid" ? 35000 : 25000;
        const discount = b.voucherCode === "GRATIS" ? price : b.voucherCode ? 10000 : 0;
        const p = { body: b, id: randomUUID(), amount: price - discount, polls: 0 };
        payments.push(p);
        return res.end(
          JSON.stringify({
            paymentId: p.id,
            qrString: p.amount ? `00020101021226QRIS-UJI-${p.id}` : "",
            amount: p.amount,
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
            ...(discount && { discount }),
          }),
        );
      }
      const pay = payments.find((p) => url === `/api/booth/payments/${p.id}`);
      if (pay) {
        pay.polls++;
        // Tagihan tanpa voucher tidak pernah dibayar: hanya QR sisa voucher yang lunas.
        const paid = pay.body.voucherCode && pay.polls >= 2;
        return res.end(JSON.stringify({ status: paid ? "paid" : "pending" }));
      }
      if (url === "/api/booth/sessions") sessions.push(JSON.parse(body));
      if (url === "/api/booth/uploads/sign") return res.end(JSON.stringify({ uploads: [] }));
      res.end(JSON.stringify({ ok: true, uploadStatus: "partial" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const env: NodeJS.ProcessEnv = { ...process.env, TETRA_GUEST_URL: `http://127.0.0.1:${port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=simulated",
      "--no-spawn",
      `--data=${mkdtempSync(join(tmpdir(), "tb-vc-"))}`,
      "--use-mock-keychain",
    ],
    env: env as Record<string, string>,
  });
  const typeCode = async (w: Page, code: string) => {
    const pad = w.getByTestId("voucher-pad");
    for (const k of code) await pad.getByRole("button", { name: k, exact: true }).click();
  };
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByTestId("step-pair").getByRole("button", { name: "Sambungkan" }).click();
    await typePin(w, "123456");
    await expect(w.getByTestId("pair-device")).toContainText("Booth Mall · B09");
    await w.getByRole("button", { name: "Kembali ke Menu Crew" }).click();
    await w.getByTestId("step-event").getByRole("button").click();
    await w.getByRole("button", { name: /Mode Photobox/ }).click();
    await w.getByRole("button", { name: "Ambil event terbaru" }).click();
    await w.getByRole("button", { name: /Photobox Mall/ }).click();
    await w.getByTestId("to-guest").click();
    await w.getByRole("button", { name: /^Mulai acara/ }).click();
    await w.waitForTimeout(1000);

    // Sesi 1: voucher potongan Rp 10.000 dari paket Rp 35.000.
    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await w.getByTestId("layout-card").filter({ hasText: "4R Grid" }).click();
    await w.getByRole("button", { name: /Lanjut ke Pembayaran/ }).click();
    await expect(w.getByTestId("payment-total")).toHaveText("Rp 35.000");
    await expect(w.getByText(/QR berlaku 0[45]:/)).toBeVisible();
    await w.waitForTimeout(400);
    await w.screenshot({ path: "test-results/voucher-1-qris-ask.png" });

    await w.getByTestId("voucher-open").click();
    const apply = w.getByRole("button", { name: "Pakai Voucher" });
    await expect(apply).toBeDisabled();
    await typeCode(w, "SALAH");
    await expect(w.getByTestId("voucher-code")).toHaveText("SALAH");
    await apply.click();
    await expect(w.getByRole("alert")).toHaveText(/tidak dikenal/);
    await w.screenshot({ path: "test-results/voucher-2-invalid.png" });
    for (let i = 0; i < 5; i++) await w.getByRole("button", { name: "Hapus" }).click();
    await typeCode(w, "HEMAT10");
    vouchersDown = true;
    await apply.click();
    await expect(w.getByRole("alert")).toHaveText(/butuh internet/);
    await w.screenshot({ path: "test-results/voucher-3-offline.png" });
    vouchersDown = false;
    await apply.click();
    await expect(w.getByTestId("payment-total")).toHaveText("Rp 25.000");
    await expect(w.getByText("Voucher HEMAT10")).toBeVisible();
    await expect(w.getByText("−Rp 10.000")).toBeVisible();
    await expect(w.getByTestId("voucher-open")).toHaveCount(0);
    await w.waitForTimeout(300);
    await w.screenshot({ path: "test-results/voucher-4-remainder.png" });
    await expect(w.getByRole("heading", { name: "Pembayaran berhasil" })).toBeVisible({
      timeout: 10_000,
    });
    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
    await expect(w.getByRole("heading", { name: "Mau cetak berapa?" })).toBeVisible({
      timeout: 15_000,
    });
    await w.getByRole("button", { name: "Cetak Sekarang" }).click();
    const s1 = payments.find((p) => p.body.voucherCode === "HEMAT10");
    await expect
      .poll(() => sessions.find((s) => s.id === s1?.body.sessionId), { timeout: 30_000 })
      .toMatchObject({ paymentId: s1?.id });
    await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });

    // Sesi 2: voucher 100% → langsung lunas, tanpa QRIS menunggu.
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    await w.waitForTimeout(1000);
    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await w.getByTestId("layout-card").filter({ hasText: "Strip Klasik" }).click();
    await w.getByRole("button", { name: /Lanjut ke Pembayaran/ }).click();
    await w.getByTestId("voucher-open").click();
    await typeCode(w, "GRATIS");
    await w.getByRole("button", { name: "Pakai Voucher" }).click();
    await expect(w.getByRole("heading", { name: "Pembayaran berhasil" })).toBeVisible();
    await expect(w.getByText(/Lunas dengan voucher/)).toBeVisible();
    await w.waitForTimeout(800);
    await w.screenshot({ path: "test-results/voucher-5-free.png" });

    // Booth tidak pernah mengirim nominal: hanya event, sesi, layout, kode.
    const sent = payments.map((p) => p.body);
    expect(sent.filter((b) => b.voucherCode)).toEqual([
      {
        eventId: EVENT,
        sessionId: s1?.body.sessionId,
        layoutId: "4r-grid",
        voucherCode: "HEMAT10",
      },
      {
        eventId: EVENT,
        sessionId: expect.any(String),
        layoutId: "strip-3",
        voucherCode: "GRATIS",
      },
    ]);
  } finally {
    await app.close();
    server.close();
  }
});
