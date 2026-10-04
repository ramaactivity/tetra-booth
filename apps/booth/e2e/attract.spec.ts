import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/**
 * Layar awal menampilkan hasil sesi asli event ini (DECISIONS #143): sebelum ada sesi = kartu contoh berbentuk
 * kertas event; setelah satu sesi selesai, potongan desain asli (blob:) muncul di kolom. 2R (3 kolom) & 4R (2 kolom).
 * Juga layar pilih mode/event yang menjelaskan langkah crew.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const slot = (id: string, x: number, y: number, w: number, h: number) =>
  ({ id, x, y, w, h, fit: "cover", z: "below_overlay" }) as const;

const EVENTS = [
  {
    id: "rina-dimas",
    name: "Rina & Dimas",
    paper: "2x6x2",
    width: 600,
    slots: [0, 1, 2].map((i) => slot(`s${i}`, 30, 30 + i * 450, 540, 420)),
    columns: 3,
  },
  {
    id: "gala-kantor",
    name: "Gala Kantor",
    paper: "4R",
    width: 1200,
    slots: [slot("a", 60, 60, 1080, 1440)],
    columns: 2,
  },
] as const;

for (const ev of EVENTS) {
  test(`layar awal ${ev.paper}: contoh berbentuk kertas, lalu hasil sesi asli muncul`, async () => {
    const data = mkdtempSync(join(tmpdir(), "tb-at-"));
    const dir = join(data, "events", ev.id, "bundle");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "config.json"),
      JSON.stringify({
        id: ev.id,
        name: ev.name,
        tagline: "Selamat datang",
        date: "12 Oktober 2026",
        layout: {
          id: `l-${ev.id}`,
          version: 1,
          paper: ev.paper,
          canvas: { width: ev.width, height: 1800, dpi: 300 },
          background: { color: "#f3c9b6" },
          slots: ev.slots,
          texts: [],
        },
        settings: { countdownSec: 1, shotDelaySec: 0.2, maxPrints: 2 },
      }),
    );
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const app = await electron.launch({
      executablePath: electronPath,
      args: [appDir, "--camera=simulated", "--no-spawn", "--start-screen", `--data=${data}`],
      env: env as Record<string, string>,
    });
    try {
      const w = await app.firstWindow();
      await expect(w.getByRole("heading", { name: "Pilih mode booth" })).toBeVisible();
      await expect(w.getByText("Cek kamera & printer")).toBeVisible();
      await expect(w.getByText("Cetak gratis, desain dari klien.")).toBeVisible();
      await w.getByRole("button", { name: /Mode Event/ }).click();
      const row = w.getByRole("button", { name: new RegExp(ev.name) });
      await expect(row).toContainText(ev.paper === "4R" ? "4R 4x6" : "2R 2x6");
      if (ev.paper === "4R") await w.screenshot({ path: "test-results/start-events.png" });
      await row.click();

      const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
      await expect(start).toBeVisible();
      const columns = w.getByTestId("attract-columns");
      // Belum ada sesi: kartu contoh (tanpa foto asli), jumlah kolom menurut bentuk kertas.
      await expect(columns.locator(":scope > div")).toHaveCount(ev.columns);
      await expect(w.getByTestId("attract-piece")).toHaveCount(0);
      await expect(columns).toContainText(ev.name);
      await w.waitForTimeout(1200); // animasi masuk selesai
      await w.screenshot({ path: `test-results/attract-sample-${ev.paper}.png` });

      await start.click();
      await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
      await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
      await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
      await expect(start).toBeVisible();

      // Hasil sesi tadi tampil sebagai gambar asli (object URL), bentuk = potongan desain event.
      const piece = w.getByTestId("attract-piece").first();
      await expect(piece).toBeVisible({ timeout: 30_000 });
      expect(await piece.getAttribute("src")).toMatch(/^blob:/);
      const ratio = await piece.evaluate((el) => {
        const img = el as HTMLImageElement;
        return img.naturalWidth / img.naturalHeight;
      });
      expect(ratio).toBeCloseTo(ev.width / 1800, 1);
      await w.waitForTimeout(1200); // animasi masuk selesai
      await w.screenshot({ path: `test-results/attract-real-${ev.paper}.png` });
    } finally {
      await app.close();
    }
  });
}
