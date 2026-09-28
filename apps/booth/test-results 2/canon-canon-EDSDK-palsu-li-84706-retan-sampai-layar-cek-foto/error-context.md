# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: canon.spec.ts >> canon (EDSDK palsu): live view dari Camera Service, 3 jepretan sampai layar cek foto
- Location: e2e/canon.spec.ts:25:5

# Error details

```
TimeoutError: locator.click: Timeout 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Selesai' })

```

# Test source

```ts
  1  | import { existsSync, mkdtempSync } from "node:fs";
  2  | import { createRequire } from "node:module";
  3  | import { tmpdir } from "node:os";
  4  | import { join } from "node:path";
  5  | import { _electron as electron, expect, type Page, test } from "@playwright/test";
  6  | 
  7  | /**
  8  |  * Canon EDSDK lewat Camera Service (DECISIONS #111) dengan driver palsu (`--canon fake`): live view dari
  9  |  * /liveview.jpg, jepret lewat WebSocket, foto 1200×800 masuk layar cek foto. Butuh `dotnet build services/camera`.
  10 |  */
  11 | 
  12 | const appDir = join(__dirname, "..");
  13 | const electronPath = createRequire(__filename)("electron") as unknown as string;
  14 | const typePin = async (w: Page, pin: string) => {
  15 |   for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  16 |   await w.getByRole("button", { name: "OK" }).click();
  17 | };
  18 | 
  19 | const serviceBin = join(
  20 |   appDir,
  21 |   "../../services/camera/TetraCamera.Host/bin/Debug/net10.0",
  22 |   process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
  23 | );
  24 | 
  25 | test("canon (EDSDK palsu): live view dari Camera Service, 3 jepretan sampai layar cek foto", async () => {
  26 |   test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  27 |   const env = { ...process.env };
  28 |   delete env.ELECTRON_RUN_AS_NODE;
  29 |   const app = await electron.launch({
  30 |     executablePath: electronPath,
  31 |     args: [
  32 |       appDir,
  33 |       "--camera=canon",
  34 |       "--canon=fake",
  35 |       `--data=${mkdtempSync(join(tmpdir(), "tb-canon-"))}`,
  36 |     ],
  37 |     env: env as Record<string, string>,
  38 |   });
  39 |   try {
  40 |     const w = await app.firstWindow();
  41 |     const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
  42 |     await expect(start).toBeVisible();
  43 |     await w.waitForTimeout(1500); // Camera Service siap + kamera palsu tersambung
  44 |     await start.click();
  45 |     await expect(w.getByText("Foto 1 dari 3")).toBeVisible();
  46 |     // Frame live view sampai: petunjuk "Lihat ke kamera" (tanpa live view) tidak tampil.
  47 |     await expect(w.getByText("Lihat ke kamera")).toBeHidden({ timeout: 5000 });
  48 |     await w.screenshot({ path: "test-results/canon-liveview.png" });
  49 |     await expect(w.getByRole("heading", { name: "Cek fotonya dulu" })).toBeVisible({
  50 |       timeout: 30_000,
  51 |     });
  52 |     await expect(w.locator("main img")).toHaveCount(3);
  53 | 
  54 |     // Setelan eksposur Canon di mode crew (ISO dari kamera lewat Camera Service).
  55 |     await w.getByRole("button", { name: /pakai semua foto/i }).click();
  56 |     await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
> 57 |     await w.getByRole("button", { name: "Selesai" }).click({ timeout: 60_000 });
     |                                                      ^ TimeoutError: locator.click: Timeout 60000ms exceeded.
  58 |     await expect(start).toBeVisible();
  59 |     for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
  60 |     await typePin(w, "2468");
  61 |     await typePin(w, "2468");
  62 |     await w.getByRole("button", { name: "Kamera & Printer" }).click();
  63 |     await expect(w.getByText("ISO · ISO 100")).toBeVisible({ timeout: 10_000 });
  64 |     await w.getByRole("button", { name: "ISO 800", exact: true }).click();
  65 |     await expect(w.getByText("ISO · ISO 800")).toBeVisible();
  66 |     await w.screenshot({ path: "test-results/canon-crew.png" });
  67 |   } finally {
  68 |     await app.close();
  69 |   }
  70 | });
  71 | 
```