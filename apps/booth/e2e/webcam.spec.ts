import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Webcam pulih sendiri & crew selalu bisa masuk dari layar kamera bermasalah (DECISIONS #170, uji tester 5 Okt:
 * setelah Buka Folder Event booth tertahan di "kamera sedang disiapkan ulang (percobaan 478)" tanpa jalan keluar).
 * Webcam palsu Chromium; track yang diakhiri / getUserMedia yang gagal disimulasikan di renderer.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;

type G = { streams: MediaStream[]; fail: boolean; sawError: boolean };
const start = async (w: Page) => {
  const b = w.getByRole("button", { name: /sentuh untuk mulai/i });
  await expect(b).toBeVisible();
  await w.waitForTimeout(1000); // START_GUARD_MS
  await b.click();
};
const session = async (w: Page) => {
  await start(w);
  await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
  await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
  await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
};

test("webcam: track mati dibuka ulang; layar kamera bermasalah tetap bisa masuk crew", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      appDir,
      "--camera=webcam",
      "--no-spawn",
      "--fast",
      `--data=${mkdtempSync(join(tmpdir(), "tb-webcam-"))}`,
    ],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    // Catat stream yang dibuka booth; `fail` = getUserMedia ditolak (webcam direbut / dimatikan Windows).
    // Layar kamera bermasalah dicatat lewat MutationObserver supaya kemunculan sesaat pun ketahuan.
    await w.evaluate(() => {
      const g = window as unknown as G;
      g.streams = [];
      g.fail = false;
      g.sawError = false;
      const md = navigator.mediaDevices;
      const real = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        if (g.fail) throw new DOMException("Could not start video source", "NotReadableError");
        const s = await real(c);
        g.streams.push(s);
        return s;
      };
      new MutationObserver(() => {
        if (document.body.textContent?.includes("kamera sedang disiapkan ulang")) g.sawError = true;
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    });

    await session(w);
    expect(await w.evaluate(() => (window as unknown as G).streams.length)).toBe(1);

    // Jendela diperkecil lalu dibuka lagi, track webcam berakhir (yang terjadi di Windows): sesi berikutnya
    // membuka ulang webcam tanpa pernah menampilkan layar kamera bermasalah.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.minimize());
    await w.evaluate(() => {
      const x = window as unknown as G;
      for (const s of x.streams) for (const t of s.getTracks()) t.stop();
    });
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.restore());
    await session(w);
    expect(await w.evaluate(() => (window as unknown as G).sawError)).toBe(false);
    expect(await w.evaluate(() => (window as unknown as G).streams.length)).toBe(2);

    // Webcam tidak bisa dibuka sama sekali → layar kamera bermasalah; crew masuk lewat Ctrl+Shift+M ...
    await w.evaluate(() => {
      const x = window as unknown as G;
      x.fail = true;
      for (const s of x.streams) for (const t of s.getTracks()) t.stop();
    });
    await start(w);
    await expect(w.getByText("Sebentar ya, kamera sedang disiapkan ulang")).toBeVisible({
      timeout: 15_000,
    });
    await expect(w.getByTestId("camera-help")).toHaveText("Butuh bantuan? Panggil crew");
    await w.screenshot({ path: "test-results/camera-error.png" });
    await w.keyboard.press("Control+Shift+M");
    await expect(w.getByText(/PIN crew/)).toBeVisible();
    await w.keyboard.press("Escape");
    // ... atau ketuk pojok kanan atas 5×.
    await start(w);
    await expect(w.getByText("Sebentar ya, kamera sedang disiapkan ulang")).toBeVisible({
      timeout: 15_000,
    });
    const hot = w.getByTestId("crew-hotspot");
    for (let i = 0; i < 5; i++) await hot.click();
    await expect(w.getByText(/PIN crew/)).toBeVisible();
    await w.keyboard.press("Escape");

    // Webcam kembali: sambung ulang otomatis berhasil, sesi lanjut dari foto yang gagal.
    await start(w);
    await expect(w.getByText("Sebentar ya, kamera sedang disiapkan ulang")).toBeVisible({
      timeout: 15_000,
    });
    await w.evaluate(() => {
      const x = window as unknown as G;
      x.fail = false;
    });
    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 30_000 });
  } finally {
    await app.close();
  }
});
