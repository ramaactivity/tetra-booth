import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Antrean bernomor photobox terhadap cloud palsu: tamu mengambil nomor di layar awal (tanpa internet), paket lunas
 * memakai giliran nomor yang dipanggil, crew melewati nomor yang tidak datang, dan antrean bertahan saat app dibuka
 * ulang.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const EVENT = "6c2f5d3e-0e7b-4f1c-9d4a-2b3c4d5e6f70";
const TOKEN = "q".repeat(54);
const strip = {
  id: "strip-3-e2e",
  version: 1,
  paper: "2x6x2",
  canvas: { width: 600, height: 1800, dpi: 300 },
  background: { color: "#ffffff" },
  slots: [0, 1, 2].map((i) => ({
    id: `s${i}`,
    x: 30,
    y: 30 + i * 390,
    w: 540,
    h: 360,
    fit: "cover",
    z: "below_overlay",
  })),
  texts: [],
};
const CONFIG = {
  id: EVENT,
  name: "Photobox Kafe",
  date: "14 Oktober 2026",
  layout: strip,
  mode: "photobox",
  photobox: {
    layouts: [
      { id: "strip-3", name: "Strip Klasik", info: "2x6 · 3 foto", price: 25000, layout: strip },
    ],
    extraPrintPrice: 10000,
    queue: true,
  },
  settings: { countdownSec: 1, shotDelaySec: 0.2, sessionSec: 180, maxPrints: 3 },
  assets: {},
};

const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};
const take = async (w: Page, n: number, ahead: RegExp) => {
  // Ketukan asli di koordinat tombol: click() Playwright menggulir <main> overflow-hidden layar awal (artefak uji).
  const b = await w.getByTestId("queue-take").boundingBox();
  if (!b) throw new Error("tombol antrean tidak terlihat");
  await w.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const ticket = w.getByTestId("queue-ticket");
  await expect(ticket).toContainText(String(n));
  await expect(ticket).toContainText(ahead);
  return ticket;
};

test("antrean photobox: ambil nomor → dipanggil → sesi lunas memakai giliran → crew lewati → bertahan", async () => {
  const payments: { id: string; polls: number }[] = [];
  const server = createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      const url = req.url ?? "";
      if (url === "/api/booth/pair")
        return res.end(
          JSON.stringify({
            token: TOKEN,
            deviceId: randomUUID(),
            name: "Booth Kafe",
            shortCode: "B10",
          }),
        );
      if (url === "/api/booth/events")
        return res.end(
          JSON.stringify({ events: [{ id: EVENT, name: "Photobox Kafe", bundleVersion: 1 }] }),
        );
      if (url === `/api/booth/events/${EVENT}/bundle`)
        return res.end(JSON.stringify({ bundleVersion: 1, config: CONFIG, files: [] }));
      if (url === "/api/booth/payments") {
        const p = { id: randomUUID(), polls: 0 };
        payments.push(p);
        return res.end(
          JSON.stringify({
            paymentId: p.id,
            qrString: `00020101021226QRIS-UJI-${p.id}`,
            amount: 25000,
            expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
          }),
        );
      }
      const pay = payments.find((p) => url === `/api/booth/payments/${p.id}`);
      if (pay) {
        pay.polls++;
        return res.end(JSON.stringify({ status: pay.polls >= 2 ? "paid" : "pending" }));
      }
      if (url === "/api/booth/uploads/sign") return res.end(JSON.stringify({ uploads: [] }));
      res.end(JSON.stringify({ ok: true, uploadStatus: "partial" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as { port: number }).port;
  const env: NodeJS.ProcessEnv = { ...process.env, TETRA_GUEST_URL: `http://127.0.0.1:${port}` };
  delete env.ELECTRON_RUN_AS_NODE;
  const data = mkdtempSync(join(tmpdir(), "tb-queue-"));
  const launch = () =>
    electron.launch({
      executablePath: electronPath,
      args: [appDir, "--camera=simulated", "--no-spawn", `--data=${data}`, "--use-mock-keychain"],
      env: env as Record<string, string>,
    });
  let app = await launch();
  try {
    let w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByTestId("step-pair").getByRole("button", { name: "Sambungkan" }).click();
    await typePin(w, "123456");
    await w.getByRole("button", { name: "Kembali ke Menu Crew" }).click();
    await w.getByTestId("step-event").getByRole("button").click();
    await w.getByRole("button", { name: /Mode Photobox/ }).click();
    await w.getByRole("button", { name: "Ambil event terbaru" }).click();
    await w.getByRole("button", { name: /Photobox Kafe/ }).click();
    await w.getByTestId("to-guest").click();
    await w.getByRole("button", { name: /^Mulai acara/ }).click();

    // Belum ada yang antre: hanya tombol ambil nomor, tanpa nomor dipanggil.
    await expect(w.getByTestId("queue-take")).toBeVisible();
    await expect(w.getByTestId("queue-called")).toHaveCount(0);
    const first = await take(w, 1, /Giliranmu sekarang/);
    await w.waitForTimeout(400);
    await w.screenshot({ path: "test-results/queue-1-ticket-first.png" });
    await first.getByRole("button", { name: "Oke" }).click();
    await (await take(w, 2, /1 nomor sebelum kamu/)).getByRole("button", { name: "Oke" }).click();
    const third = await take(w, 3, /2 nomor sebelum kamu/);
    await w.screenshot({ path: "test-results/queue-2-ticket-third.png" });
    await third.getByRole("button", { name: "Oke" }).click();
    await expect(w.getByTestId("queue-called")).toContainText("1");
    await expect(w.getByTestId("queue-take")).toContainText("3 antre");
    // Baris antrean muat di kolom judul: judul tidak terdorong keluar layar, tidak menimpa kolom contoh.
    const box = async (sel: string) => {
      const b = await w.locator(sel).first().boundingBox();
      if (!b) throw new Error(`${sel} tidak terlihat`);
      return b;
    };
    const viewport = await w.evaluate(() => window.innerHeight);
    const [title, bar, cols] = await Promise.all([
      box("h1"),
      box('[data-testid="queue-take"]'),
      box('[data-testid="attract-columns"]'),
    ]);
    expect(title.y).toBeGreaterThanOrEqual(0);
    expect(bar.y + bar.height).toBeLessThanOrEqual(viewport);
    expect(bar.x + bar.width).toBeLessThan(cols.x);
    await w.screenshot({ path: "test-results/queue-3-attract.png" });

    // Nomor 1 masuk: batal sebelum bayar tidak menghanguskan nomor; paket lunas = giliran terpakai.
    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await w.getByRole("button", { name: "Kembali" }).click();
    await expect(w.getByTestId("queue-called")).toContainText("1");
    await w.waitForTimeout(1000); // tombol mulai aktif setelah START_GUARD_MS
    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await w.getByTestId("layout-card").first().click();
    await w.getByRole("button", { name: /Lanjut ke Pembayaran/ }).click();
    await expect(w.getByRole("heading", { name: "Pembayaran berhasil" })).toBeVisible({
      timeout: 10_000,
    });
    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
    await w.getByRole("button", { name: "Cetak Sekarang" }).click({ timeout: 15_000 });
    await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
    await expect(w.getByTestId("queue-called")).toContainText("2");
    await expect(w.getByTestId("queue-take")).toContainText("2 antre");

    // Nomor 2 tidak datang: crew melewatinya dari Ringkasan.
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await expect(w.getByTestId("crew-queue")).toHaveText("Dipanggil nomor 2 · 2 antre");
    await w.getByRole("button", { name: "Lewati nomor" }).click();
    await expect(w.getByTestId("crew-queue")).toHaveText("Dipanggil nomor 3 · 1 antre");
    await w.screenshot({ path: "test-results/queue-4-crew.png" });
    await w.getByTestId("to-guest").click();
    await expect(w.getByTestId("queue-called")).toContainText("3");

    // Antrean tersimpan di SQLite: tetap nomor 3 setelah app dibuka ulang (offline, tanpa cloud).
    await app.close();
    server.close();
    app = await launch();
    w = await app.firstWindow();
    await expect(w.getByTestId("queue-called")).toContainText("3");
    await expect(w.getByTestId("queue-take")).toContainText("1 antre");
    await w.screenshot({ path: "test-results/queue-5-reopen.png" });
  } finally {
    await app.close();
    server.close();
  }
});
