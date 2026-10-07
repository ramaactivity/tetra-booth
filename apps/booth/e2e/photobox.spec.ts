import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Fase 4 photobox end-to-end (DECISIONS #70) terhadap cloud palsu: pilih layout → QRIS paket lunas → sesi dengan
 * timer → tambah 1 lembar → QRIS tambahan lunas → cetak 2 lembar; sesi terunggah dengan paymentId paket.
 * Harga dan QR dari server; booth hanya mengirim eventId, sessionId, layoutId, extraPrints.
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
  },
  settings: { countdownSec: 1, shotDelaySec: 0.2, sessionSec: 180, maxPrints: 3 },
  assets: {},
};

const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

let paymentsDown = false;

test("photobox: layout → QRIS → foto dengan timer → tambah lembar → QRIS → cetak", async () => {
  const payments: { body: Record<string, unknown>; id: string; amount: number; polls: number }[] =
    [];
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
      if (url === "/api/booth/payments" && paymentsDown) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ error: "payment_unavailable" }));
      }
      if (url === "/api/booth/payments") {
        const b = JSON.parse(body) as { layoutId: string; extraPrints?: number };
        const amount = b.extraPrints
          ? b.extraPrints * 10000
          : b.layoutId === "4r-grid"
            ? 35000
            : 25000;
        const p = { body: b, id: randomUUID(), amount, polls: 0 };
        payments.push(p);
        return res.end(
          JSON.stringify({
            paymentId: p.id,
            qrString: `00020101021226QRIS-UJI-${p.id}`,
            amount,
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          }),
        );
      }
      const pay = payments.find((p) => url === `/api/booth/payments/${p.id}`);
      if (pay) {
        pay.polls++;
        return res.end(JSON.stringify({ status: pay.polls >= 2 ? "paid" : "pending" }));
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
      `--data=${mkdtempSync(join(tmpdir(), "tb-pb-"))}`,
      "--use-mock-keychain",
    ],
    env: env as Record<string, string>,
  });
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
    await expect(w.getByTestId("cloud-device")).toHaveText("Booth Mall · B09");
    // Ganti Event = layar pilih mode (DECISIONS #86) → Photobox → event → checklist crew → Buka untuk Tamu.
    await w.getByTestId("step-event").getByRole("button").click();
    await w.getByRole("button", { name: /Mode Photobox/ }).click();
    await w.getByRole("button", { name: "Ambil event terbaru" }).click();
    await w.getByRole("button", { name: /Photobox Mall/ }).click();
    await w.getByTestId("to-guest").click();
    // Event cloud belum mulai: pop-up Mulai acara / Tes dulu (#152).
    await w.getByRole("button", { name: /^Mulai acara/ }).click();
    await w.waitForTimeout(1000);

    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await expect(w.getByRole("heading", { name: "Pilih layout" })).toBeVisible();
    await expect(w.getByTestId("layout-card")).toHaveCount(2);
    await w.getByTestId("layout-card").filter({ hasText: "4R Grid" }).click();
    await w.screenshot({ path: "test-results/photobox-A2-layout.png" });
    await w.getByRole("button", { name: /Lanjut ke Pembayaran/ }).click();

    await expect(w.getByTestId("payment-total")).toHaveText("Rp 35.000");
    await expect(w.getByText(/QR berlaku 0[45]:/)).toBeVisible();
    await w.waitForTimeout(400);
    await w.screenshot({ path: "test-results/photobox-A3-qris.png" });
    // Batalkan dua langkah (audit UX): ketukan pertama hanya meminta konfirmasi.
    await w.getByRole("button", { name: "Batalkan" }).click();
    await expect(w.getByRole("button", { name: "Ya, Batalkan" })).toBeVisible();
    await expect(w.getByText(/Jangan batalkan/)).toBeVisible();
    await expect(w.getByRole("heading", { name: "Pembayaran berhasil" })).toBeVisible({
      timeout: 10_000,
    });
    await w.screenshot({ path: "test-results/photobox-A4-paid.png" });
    await expect(w.getByTestId("time-left")).toContainText(/Sisa waktu 0[23]:/, {
      timeout: 10_000,
    });

    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
    await expect(w.getByRole("heading", { name: "Mau cetak berapa?" })).toBeVisible({
      timeout: 15_000,
    });
    await w.getByRole("button", { name: "Tambah" }).click();
    await expect(w.getByTestId("extra-total")).toHaveText("Rp 10.000");
    // Semua isi A7b muat di kanvas 1080 px (tombol tidak terpotong di layar booth).
    expect(
      await w.evaluate(() =>
        [...document.querySelectorAll("main section")].every(
          (s) => s.scrollHeight <= s.clientHeight + 1,
        ),
      ),
    ).toBe(true);
    await w.waitForTimeout(400);
    await w.screenshot({ path: "test-results/photobox-A7b-print.png" });
    await w.getByRole("button", { name: "Bayar & Cetak" }).click();
    await expect(w.getByTestId("payment-total")).toHaveText("Rp 10.000");
    await expect(w.getByText(/2 lembar/)).toBeVisible({ timeout: 15_000 });
    await w.screenshot({ path: "test-results/photobox-A8-print.png" });

    expect(payments.map((p) => p.body)).toEqual([
      { eventId: EVENT, sessionId: payments[0]?.body.sessionId, layoutId: "4r-grid" },
      {
        eventId: EVENT,
        sessionId: payments[0]?.body.sessionId,
        layoutId: "4r-grid",
        extraPrints: 1,
      },
    ]);
    await expect
      .poll(() => sessions.find((s) => s.id === payments[0]?.body.sessionId), { timeout: 30_000 })
      .toMatchObject({ eventId: EVENT, photoCount: 2, printCount: 2, paymentId: payments[0]?.id });

    // Tanpa bypass (FSD §1.12): cloud gagal membuat QRIS → "hubungi crew", tidak ada jalan ke sesi foto.
    paymentsDown = true;
    await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    await w.waitForTimeout(1000); // tombol mulai aktif setelah START_GUARD_MS
    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await w.getByTestId("layout-card").first().click();
    await w.getByRole("button", { name: /Lanjut ke Pembayaran/ }).click();
    await expect(
      w.getByRole("heading", { name: "Pembayaran belum bisa diproses, hubungi crew" }),
    ).toBeVisible();
    await w.getByRole("button", { name: "Batalkan" }).click();
    await expect(w.getByRole("heading", { name: "Pilih layout" })).toBeVisible();
  } finally {
    await app.close();
    server.close();
  }
});
