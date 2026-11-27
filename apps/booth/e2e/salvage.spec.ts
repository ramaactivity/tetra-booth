import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/**
 * Kamera mati di tengah sesi → crew masuk mode crew: foto yang sudah diambil tetap jadi sesi selesai (original
 * di out/), bukan hilang. Dulu mode crew melepas SessionRunner dan sesinya baru ditandai `abandoned` saat boot
 * berikutnya (audit 27 Nov 2026).
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
type G = { streams: MediaStream[]; fail: boolean };

test("foto sesi diselamatkan saat crew masuk dari layar kamera bermasalah", async () => {
  test.setTimeout(120_000);
  const data = mkdtempSync(join(tmpdir(), "tb-salvage-"));
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
      `--data=${data}`,
    ],
    env: env as Record<string, string>,
  });
  const sessions = join(data, "sessions");
  const files = (sub: string) =>
    existsSync(sessions)
      ? readdirSync(sessions).flatMap((id) =>
          existsSync(join(sessions, id, sub))
            ? readdirSync(join(sessions, id, sub)).map((f) => `${id}/${f}`)
            : [],
        )
      : [];
  try {
    const w = await app.firstWindow();
    const b = w.getByRole("button", { name: /sentuh untuk mulai/i });
    await expect(b).toBeVisible();
    await w.evaluate(() => {
      const g = window as unknown as G;
      g.streams = [];
      g.fail = false;
      const md = navigator.mediaDevices;
      const real = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        if (g.fail) throw new DOMException("Could not start video source", "NotReadableError");
        const s = await real(c);
        g.streams.push(s);
        return s;
      };
    });
    await w.waitForTimeout(1000); // START_GUARD_MS
    await b.click();

    // Foto pertama tersimpan, lalu webcam mati sebelum foto berikutnya.
    await expect.poll(() => files("raw").length, { timeout: 30_000 }).toBeGreaterThan(0);
    await w.evaluate(() => {
      const x = window as unknown as G;
      x.fail = true;
      for (const s of x.streams) for (const t of s.getTracks()) t.stop();
    });
    await expect(w.getByText("Sebentar ya, kamera sedang disiapkan ulang")).toBeVisible({
      timeout: 20_000,
    });
    expect(files("out").filter((f) => f.endsWith("/original_1.jpg"))).toHaveLength(0);
    await w.keyboard.press("Control+Shift+M");
    await expect(w.getByText(/PIN crew/)).toBeVisible();

    await expect
      .poll(() => files("out").filter((f) => f.endsWith("/original_1.jpg")).length, {
        timeout: 20_000,
      })
      .toBe(1);
    expect(files("out").some((f) => f.endsWith("strip_web.jpg"))).toBe(false);
  } finally {
    await app.close();
  }
});
