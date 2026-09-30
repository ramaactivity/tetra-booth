import { existsSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Canon EDSDK lewat Camera Service (DECISIONS #111) dengan driver palsu (`--canon fake`): live view dari
 * /liveview.jpg, jepret lewat WebSocket, foto 1200×800 masuk layar cek foto. Butuh `dotnet build services/camera`.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

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

test("canon (EDSDK palsu): setelan ISO dari kamera tampil & bisa diubah di mode crew", async () => {
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
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    await w.waitForTimeout(1500);
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByRole("button", { name: /Pengaturan lain/ }).click();
    await w.getByRole("button", { name: "Kamera & Printer" }).click();
    await expect(w.getByText("ISO live view · ISO 100")).toBeVisible({ timeout: 10_000 });
    await expect(w.getByText("ISO jepret (flash) · Sama dengan live view")).toBeVisible();
    await expect(w.getByText("Kualitas · JPEG L Fine")).toBeVisible();
    await w.getByRole("button", { name: "ISO 800", exact: true }).first().click();
    await expect(w.getByText("ISO live view · ISO 800")).toBeVisible();
    await w.screenshot({ path: "test-results/canon-crew.png" });

    // Tap to focus (#114) di Tes Jepret: ketukan diteruskan ke Camera Service.
    const logs: string[] = [];
    app.process().stdout?.on("data", (d) => logs.push(String(d)));
    await w.getByRole("button", { name: "Batal" }).click();
    await w
      .getByRole("button", { name: /Tes Jepret/ })
      .first()
      .click();
    await expect(w.getByText("Ketuk subjek di live view untuk fokus")).toBeVisible();
    await w.getByTestId("tap-focus").click({ position: { x: 500, y: 400 } });
    await expect.poll(() => logs.join("")).toMatch(/\[camera\] fokus di 0\.\d\d,0\.\d\d/);
    await w.screenshot({ path: "test-results/canon-tapfocus.png" });

    // Setelan kamera di Tes Jepret (W-034): panel di atas live view, perubahan langsung ke kamera.
    await w.getByRole("button", { name: "Setelan kamera" }).click();
    const shutter = w.getByTestId("camera-prop-shutterspeed");
    await expect(shutter).toBeVisible();
    await expect(w.getByTestId("camera-prop-shutter_capture")).toContainText(
      "Sama dengan live view",
    );
    await shutter.getByRole("button", { name: "1/60", exact: true }).click();
    await expect(shutter).toContainText("Shutter · 1/60");
    await w.screenshot({ path: "test-results/canon-settings.png" });
  } finally {
    await app.close();
  }
});
