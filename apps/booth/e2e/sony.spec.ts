import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";

/**
 * Sony Camera Remote Command lewat Camera Service (DECISIONS #169, #171) dengan kamera palsu tingkat PTP (`--sony fake`
 * = A7 III v2, `fake-v3` = A7 IV v3): sesi tamu penuh (live view, jepret S1/S2, unduh JPEG, cetak), Tes Jepret
 * (live view + setelan, ISO diubah, tap to focus hanya v3), dan cabut-colok kabel (file `TETRA_SONY_FAKE_UNPLUG`).
 * Butuh `dotnet build services/camera`.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const serviceBin = join(
  appDir,
  "../../services/camera/TetraCamera.Host/bin/Debug/net10.0",
  process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
);
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};
type Status = { connected: boolean; model: string | null; tapFocus?: boolean };
const status = (w: Page) =>
  w.evaluate(async () =>
    (window as unknown as { tetra: { cameraStatus(): Promise<Status> } }).tetra
      .cameraStatus()
      .catch(() => null),
  );

const BODIES = [
  { fake: "fake", model: "ILCE-7M3", name: "A7 III", tap: false },
  { fake: "fake-v3", model: "ILCE-7M4", name: "A7 IV", tap: true },
] as const;

const launch = async (fake: string, extra: string[] = [], unplug?: string) => {
  const env: Record<string, string | undefined> = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  if (unplug) env.TETRA_SONY_FAKE_UNPLUG = unplug;
  return electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=sony",
      `--sony=${fake}`,
      ...extra,
      `--data=${mkdtempSync(join(tmpdir(), "tb-sony-"))}`,
    ],
    env: env as Record<string, string>,
  });
};

const connected = async (w: Page, model: string) =>
  expect
    .poll(
      async () => {
        const s = await status(w);
        return s?.connected ? s.model : null;
      },
      { timeout: 15_000 },
    )
    .toBe(model);

for (const b of BODIES) {
  test(`sony ${b.name} (${b.fake}): sesi tamu penuh, live view → jepret → cek foto → cetak`, async () => {
    test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
    const app = await launch(b.fake, ["--fast"]);
    try {
      const w = await app.firstWindow();
      const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
      await expect(start).toBeVisible();
      await connected(w, b.model);
      await w.waitForTimeout(1000); // START_GUARD_MS
      await start.click();
      await expect(w.getByText("Foto 1 dari 3")).toBeVisible();
      // Frame live view Sony sampai: petunjuk "Lihat ke kamera" (tanpa live view) tidak tampil.
      await expect(w.getByText("Lihat ke kamera")).toBeHidden({ timeout: 5000 });
      await w.screenshot({ path: `test-results/sony-${b.fake}-countdown.png` });
      await expect(w.getByRole("heading", { name: "Cek fotonya dulu" })).toBeVisible({
        timeout: 30_000,
      });
      await expect(w.locator("main img")).toHaveCount(3);
      await w.getByRole("button", { name: /pakai semua foto/i }).click();
      await w.screenshot({ path: `test-results/sony-${b.fake}-print-preview.png` });
      await w.getByRole("button", { name: /cetak sekarang/i }).click({ timeout: 15_000 });
      // Printer Mac (tanpa driver) menolak job: sesi tetap selesai sendiri dan kembali ke layar awal.
      await expect(start).toBeVisible({ timeout: 90_000 });
      await expect(w.getByText("1 foto")).toBeVisible();
    } finally {
      await app.close();
    }
  });

  test(`sony ${b.name} (${b.fake}): Tes Jepret live view + setelan, ISO diubah, tap to focus ${b.tap ? "ada" : "tersembunyi"}`, async () => {
    test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
    const app = await launch(b.fake);
    try {
      const w = await app.firstWindow();
      await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
      await connected(w, b.model);
      expect((await status(w))?.tapFocus).toBe(b.tap);
      for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
      await typePin(w, "2468");
      await typePin(w, "2468");
      await w.getByTestId("crew-nav-camera").click();
      const logs: string[] = [];
      app.process().stdout?.on("data", (d) => logs.push(String(d)));
      // Kecerahan monitor (#233): stepper menggeser ISO, shutter dikunci anti kedip 1/50.
      await expect(w.getByTestId("monitor-brightness")).toBeVisible({ timeout: 10_000 });
      await expect(w.getByText("Simpan foto ke · PC saja")).toBeVisible();
      await expect(w.getByTestId("camera-prop-iso")).toHaveCount(0);
      await w.getByRole("button", { name: "Lebih terang" }).click();
      await expect.poll(() => logs.join("")).toMatch(/\[camera\] iso = /);
      await expect.poll(() => logs.join("")).toMatch(/\[camera\] shutterspeed = 1\/\d+/);
      await w
        .getByRole("button", { name: /Tes Jepret/ })
        .first()
        .click();
      await expect(w.getByTestId("camera-prop-battery")).toContainText("80%");
      // Live view jalan (meter ketajaman dari frame) sebelum tap-to-focus ditanyakan ke kamera.
      await expect(w.getByTestId("focus-meter")).toBeVisible({ timeout: 10_000 });
      if (b.tap) {
        await expect(w.getByText("Ketuk subjek di live view untuk fokus")).toBeVisible();
        await w.getByTestId("tap-focus").click({ position: { x: 500, y: 400 } });
        await expect.poll(() => logs.join("")).toMatch(/\[camera\] fokus di 0\.\d\d,0\.\d\d/);
      } else {
        await w.waitForTimeout(500);
        await expect(w.getByTestId("tap-focus")).toHaveCount(0);
      }
      await w.screenshot({ path: `test-results/sony-${b.fake}-tes-jepret.png` });
      await w
        .getByRole("button", { name: /Tes Jepret/ })
        .last()
        .click();
      await expect(w.getByTestId("last-shot").locator("img")).toBeVisible({ timeout: 20_000 });
      // Hasil tes tampil besar di area live view ±5 s, lalu live view kembali sendiri.
      await expect(w.getByTestId("shot-flash")).toBeVisible();
      await w.screenshot({ path: `test-results/sony-${b.fake}-tes-jepret-preview.png` });
      await expect(w.getByTestId("shot-flash")).toBeHidden({ timeout: 8_000 });
      await w.getByRole("button", { name: "60 Hz" }).click();
      await expect.poll(() => logs.join("")).toMatch(/\[camera\] shutterspeed = 1\/60/);
      await w.getByRole("button", { name: "50 Hz" }).click();
      // Live view kembali setelah Tes Jepret (LiveView dipasang ulang).
      await expect(w.getByText("Lihat ke kamera")).toBeHidden({ timeout: 10_000 });
      await w.screenshot({ path: `test-results/sony-${b.fake}-tes-jepret-shot.png` });
    } finally {
      await app.close();
    }
  });
}

test("sony A7 III: kabel dicabut lalu dicolok, booth pulih tanpa restart", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  const unplug = join(mkdtempSync(join(tmpdir(), "tb-sony-unplug-")), "unplugged");
  let app: ElectronApplication | undefined;
  try {
    app = await launch("fake", ["--fast"], unplug);
    const w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    await connected(w, "ILCE-7M3");
    writeFileSync(unplug, "");
    await expect.poll(async () => (await status(w))?.connected, { timeout: 10_000 }).toBe(false);
    rmSync(unplug);
    await connected(w, "ILCE-7M3");
    // Sesi tamu setelah colok ulang: jepret jalan tanpa membuka ulang booth.
    await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();
    await expect(w.getByRole("heading", { name: "Cek fotonya dulu" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(w.locator("main img")).toHaveCount(3);
  } finally {
    await app?.close();
    rmSync(unplug, { force: true });
  }
});
