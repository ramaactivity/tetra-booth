import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/** Bumper video saat event dibuka (#105): diputar penuh lalu hilang; sentuhan melewatinya. */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;

test("bumper: video H.264 diputar di atas layar awal, lalu hilang; sentuh = lewati", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      executablePath: electronPath,
      args: [
        appDir,
        "--camera=simulated",
        "--no-spawn",
        "--bumper",
        `--data=${mkdtempSync(join(tmpdir(), "tb-bm-"))}`,
      ],
      env: env as Record<string, string>,
    });

  const app = await launch();
  try {
    const w = await app.firstWindow();
    const bumper = w.getByTestId("bumper");
    await expect(bumper).toBeVisible();
    // Codec benar-benar bisa diputar Electron (bukan langsung onError).
    await expect
      // Runner Linux (xvfb) mendekode lebih lambat: beri waktu lebih.
      .poll(() => w.evaluate(() => document.querySelector("video")?.currentTime ?? 0), {
        timeout: 15_000,
      })
      .toBeGreaterThan(0.5);
    expect(await w.evaluate(() => document.querySelector("video")?.duration)).toBeCloseTo(6.5, 0);
    await w.screenshot({ path: "test-results/bumper-mid.png" });
    // Transisi mulus: layar awal mulai dibangun saat bumper memudar (bumper & judul tampil bersamaan).
    const title = w.getByRole("heading", { level: 1 });
    await expect(title).toBeVisible({ timeout: 12_000 });
    await w.waitForTimeout(150);
    await w.screenshot({ path: "test-results/bumper-transition.png" });
    await expect(bumper).toBeHidden();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
  } finally {
    await app.close();
  }

  const again = await launch();
  try {
    const w = await again.firstWindow();
    await w.getByTestId("bumper").click();
    await expect(w.getByTestId("bumper")).toBeHidden();
  } finally {
    await again.close();
  }
});
