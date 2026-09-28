import { existsSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/**
 * Canon EDSDK lewat Camera Service (DECISIONS #111) dengan driver palsu (`--canon fake`): live view dari
 * /liveview.jpg, jepret lewat WebSocket, foto 1200×800 masuk layar cek foto. Butuh `dotnet build services/camera`.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const serviceBin = join(
  appDir,
  "../../services/camera/TetraCamera.Host/bin/Debug/net10.0",
  process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
);

test("canon (EDSDK palsu): live view dari Camera Service, 3 jepretan sampai layar cek foto", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=canon",
      "--canon=fake",
      `--data=${mkdtempSync(join(tmpdir(), "tb-canon-"))}`,
    ],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
    await expect(start).toBeVisible();
    await w.waitForTimeout(1500); // Camera Service siap + kamera palsu tersambung
    await start.click();
    await expect(w.getByText("Foto 1 dari 3")).toBeVisible();
    // Frame live view sampai: petunjuk "Lihat ke kamera" (tanpa live view) tidak tampil.
    await expect(w.getByText("Lihat ke kamera")).toBeHidden({ timeout: 5000 });
    await w.screenshot({ path: "test-results/canon-liveview.png" });
    await expect(w.getByRole("heading", { name: "Cek fotonya dulu" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(w.locator("main img")).toHaveCount(3);
  } finally {
    await app.close();
  }
});
