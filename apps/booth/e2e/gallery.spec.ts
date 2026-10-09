import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Galeri tamu dari layar awal (DECISIONS #145): 2 sesi → "Lihat foto 2 foto" → grid → detail → Scan QR (/s/<id>)
 * → Cetak lagi lewat jalur cetak yang sama (job `<id>-g…`) → batas maxPrints lembar per sesi tercapai.
 * Tanpa Camera Service (--no-spawn): job tetap queued, layar "Sedang mencetak…", log `[gallery] cetak lagi`.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const slot = (id: string, x: number, y: number, w: number, h: number) =>
  ({ id, x, y, w, h, fit: "cover", z: "below_overlay" }) as const;

const session = async (w: Page) => {
  const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
  await expect(start).toBeVisible();
  await w.waitForTimeout(1000); // START_GUARD_MS: sentuhan pertama setelah layar muncul diabaikan
  await start.click();
  await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
  await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
  await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
};

test("galeri tamu: lihat foto, scan QR, cetak lagi sampai batas", async () => {
  const data = mkdtempSync(join(tmpdir(), "tb-gal-"));
  const dir = join(data, "events", "rina-dimas", "bundle");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      id: "rina-dimas",
      name: "Rina & Dimas",
      tagline: "Selamat datang",
      date: "12 Oktober 2026",
      layout: {
        id: "l-strip",
        version: 1,
        paper: "2x6x2",
        canvas: { width: 600, height: 1800, dpi: 300 },
        background: { color: "#f3c9b6" },
        slots: [0, 1, 2].map((i) => slot(`s${i}`, 30, 30 + i * 450, 540, 420)),
        texts: [
          {
            x: 30,
            y: 1400,
            w: 540,
            fontAssetId: "geist",
            size: 44,
            color: "#1d1d1b",
            align: "center",
            value: "Rina & Dimas · 12.10.26",
          },
        ],
      },
      settings: { countdownSec: 1, shotDelaySec: 0.2, maxPrints: 2 },
      info: { slug: "rina-dimas-2026-10-12", publicGallery: true },
    }),
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=simulated",
      "--no-spawn",
      "--start-screen",
      "--size=1920x1080",
      `--data=${data}`,
    ],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    await w.getByRole("button", { name: /Mode Event/ }).click();
    await w.getByRole("button", { name: /Rina & Dimas/ }).click();

    // Sebelum ada sesi: tanpa tombol galeri.
    const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
    await expect(start).toBeVisible();
    const open = w.getByRole("button", { name: /Lihat foto/ });
    await expect(open).toHaveCount(0);

    await session(w);
    await session(w);
    await expect(w.getByTestId("gallery-count")).toHaveText("2 foto", { timeout: 30_000 });
    await expect(w.getByTestId("attract-piece").first()).toBeVisible({ timeout: 30_000 });
    await w.waitForTimeout(1200);
    await w.screenshot({ path: "test-results/gallery-attract.png" });

    await open.click();
    const cards = w.getByTestId("gallery-card");
    await expect(cards).toHaveCount(2);
    await expect(w.getByRole("heading", { name: "Foto Rina & Dimas" })).toBeVisible();
    await expect(cards.first().locator("img")).toBeVisible({ timeout: 15_000 });
    await expect(cards.nth(1).locator("img")).toBeVisible({ timeout: 15_000 });
    await w.waitForTimeout(600); // animasi masuk selesai
    await w.screenshot({ path: "test-results/gallery-grid.png" });
    // Galeri online (#240): QR galeri publik acara untuk tamu.
    await w.getByRole("button", { name: "Galeri online" }).click();
    await expect(w.getByTestId("gallery-qr-url")).toHaveText(/\/l\/rina-dimas-2026-10-12$/);
    await w.screenshot({ path: "test-results/gallery-online-qr.png" });
    await w.getByTestId("gallery-qr").getByRole("button", { name: "Tutup" }).click();
    await expect(w.getByTestId("gallery-qr")).toBeHidden();
    const cardBox = await cards.first().boundingBox();
    if (cardBox)
      await w.screenshot({
        path: "test-results/gallery-grid-zoom.png",
        clip: cardBox,
        scale: "device",
      });

    // Detail: gambar penuh, Scan QR = link tamu sesi itu.
    await cards.first().click();
    await expect(w.getByTestId("gallery-full")).toBeVisible();
    await w.waitForTimeout(400);
    await w.screenshot({ path: "test-results/gallery-detail.png" });
    const fullBox = await w.getByTestId("gallery-full").boundingBox();
    if (fullBox)
      await w.screenshot({
        path: "test-results/gallery-detail-zoom.png",
        clip: { ...fullBox, height: Math.min(fullBox.height, 400) },
        scale: "device",
      });
    await w.getByRole("button", { name: /Scan QR/ }).click();
    const qr = w.getByRole("img", { name: /\/s\/[A-Za-z0-9]+$/ });
    await expect(qr).toBeVisible();
    const id = /\/s\/([A-Za-z0-9]+)$/.exec((await qr.getAttribute("aria-label")) ?? "")?.[1];
    expect(id).toBeTruthy();
    await w.waitForTimeout(400);
    await w.screenshot({ path: "test-results/gallery-qr.png" });
    await w.getByRole("button", { name: "Kembali", exact: true }).click();

    // Cetak lagi 1 lembar → job galeri lewat jalur cetak yang sama.
    const reprint = async (shot?: string) => {
      await w.getByRole("button", { name: /Cetak lagi/ }).click();
      await w.getByRole("button", { name: "Cetak 1 lembar" }).click();
      await expect(w.getByText("Sedang mencetak…")).toBeVisible();
      await w.waitForTimeout(400);
      if (shot) await w.screenshot({ path: shot });
      await w.getByRole("button", { name: "Kembali", exact: true }).click();
    };
    await reprint("test-results/gallery-printing.png");
    await expect(w.getByText("Sudah dicetak 2 lembar")).toBeVisible();
    await reprint();

    // maxPrints = 2 lembar dari galeri: batas tercapai.
    await expect(w.getByText(/Batas cetak ulang tercapai/)).toBeVisible();
    await w.getByRole("button", { name: /Cetak lagi/ }).click();
    await expect(w.getByRole("status")).toContainText("Batas cetak ulang tercapai");
    await w.waitForTimeout(400);
    await w.screenshot({ path: "test-results/gallery-limit.png" });

    // Geser ke sesi lain: masih bisa dicetak.
    await w.getByRole("button", { name: "Kembali", exact: true }).click();
    await w.getByRole("button", { name: "Foto berikutnya" }).click();
    await expect(w.getByText("Masih bisa 2 lembar")).toBeVisible();

    // Kembali ke awal, lalu kartu di kolom layar awal membuka galeri di sesi itu.
    await w.getByRole("complementary").getByRole("button", { name: "Kembali ke awal" }).click();
    await expect(start).toBeVisible();
    await w.waitForTimeout(1000);
    await w.getByRole("button", { name: "Buka foto ini" }).first().click({ force: true });
    await expect(w.getByTestId("gallery-full")).toBeVisible();
    await w.getByRole("button", { name: "Semua foto" }).click();
    await expect(cards).toHaveCount(2);
    await w.getByRole("button", { name: "Kembali ke awal" }).click();
    await expect(start).toBeVisible();

    const log = readdirSync(join(data, "logs"))
      .map((f) => readFileSync(join(data, "logs", f), "utf8"))
      .join("\n");
    const jobs = log.match(new RegExp(`\\[gallery\\] cetak lagi ${id}-g\\w+: 1 lembar`, "g"));
    expect(jobs).toHaveLength(2);
    expect(log).toMatch(new RegExp(`\\[print\\] tertunda ${id}-g`));
  } finally {
    await app.close();
  }
});
