import { execSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
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
 * Printer bersama lewat WiFi (#261): laptop A = laptop printer (pusat), laptop B = booth tanpa printer. Crew B
 * mencari A, mengetik kode dari layar A, Simpan, lalu Tes Cetak → lembar sampai di A. A ditutup (WiFi putus) →
 * cetakan B antre, A dibuka lagi → terkirim sendiri. Tanpa Camera Service (--no-spawn): A menyimpan lembar kiriman.
 */
const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const env: NodeJS.ProcessEnv = { ...process.env, TETRA_NO_SHELL_OPEN: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const launch = (data: string) =>
  electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=simulated",
      "--no-spawn",
      `--data=${data}`,
      "--use-mock-keychain",
      "--size=1920x1080",
    ],
    env: env as Record<string, string>,
  });
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};
/** Masuk mode crew → halaman Printer. PIN baru dibuat sekali per folder data. */
const crewPrinter = async (app: ElectronApplication, firstTime: boolean) => {
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible({
    timeout: 30_000,
  });
  for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
  await typePin(w, "2468");
  if (firstTime) await typePin(w, "2468");
  await w.getByTestId("crew-nav-printer").click();
  return w;
};
const inbox = (data: string) => {
  const d = join(data, "sessions", "lan-prints");
  return existsSync(d) ? readdirSync(d) : [];
};

test("booth mencetak lewat laptop printer di WiFi yang sama, antre saat putus", async () => {
  test.setTimeout(180_000);
  const hubData = mkdtempSync(join(tmpdir(), "tb-hub-"));
  const boothData = mkdtempSync(join(tmpdir(), "tb-sat-"));
  mkdirSync(hubData, { recursive: true });
  writeFileSync(join(hubData, "device.json"), JSON.stringify({ printShare: "hub" }));

  let hub = await launch(hubData);
  let booth: ElectronApplication | null = null;
  try {
    const hw = await crewPrinter(hub, true);
    const key = (await hw.getByTestId("share-key").textContent())?.trim() ?? "";
    expect(key).toMatch(/^\d{4}$/);
    await hw.screenshot({ path: "test-results/print-share-hub.png" });

    booth = await launch(boothData);
    let bw = await crewPrinter(booth, true);
    await bw.getByTestId("share-remote").click();
    await expect(bw.getByTestId("share-hub-choice")).toHaveCount(1, { timeout: 10_000 });
    await bw.getByTestId("share-code").fill("0000");
    await bw.getByRole("button", { name: "Hubungkan" }).click();
    await expect(bw.getByText(/kode printer salah/i)).toBeVisible();
    await bw.getByTestId("share-code").fill(key);
    await bw.getByRole("button", { name: "Hubungkan" }).click();
    await expect(bw.getByTestId("device-savebar")).toContainText("Printer bersama");
    await bw.screenshot({ path: "test-results/print-share-booth-connect.png" });
    // Simpan = device.json ditulis lalu booth dibuka ulang sendiri; di uji, buka ulang lewat Playwright.
    await bw
      .getByTestId("device-savebar")
      .getByRole("button", { name: /simpan/i })
      .click();
    await expect.poll(() => existsSync(join(boothData, "device.json"))).toBe(true);
    await booth.close().catch(() => {});
    // "[-]" supaya pola tidak cocok dengan shell pkill sendiri (Linux CI membunuh shell-nya).
    execSync(`pkill -f "[-]-data=${boothData}" || true`);
    booth = await launch(boothData);
    bw = await crewPrinter(booth, false);
    await expect(bw.getByTestId("share-target")).toContainText("Terhubung", { timeout: 15_000 });

    await bw.getByRole("button", { name: "Tes Cetak" }).click();
    await expect.poll(() => inbox(hubData).length, { timeout: 20_000 }).toBe(1);
    await expect(hw.getByTestId("share-peer")).toHaveCount(1, { timeout: 10_000 });
    await hw.screenshot({ path: "test-results/print-share-hub-peer.png" });
    await bw.screenshot({ path: "test-results/print-share-booth.png" });

    // WiFi putus: laptop printer mati → cetakan antre di booth, terkirim sendiri begitu laptop printer kembali.
    await hub.close();
    await expect(bw.getByTestId("share-target")).toContainText("Tidak terjangkau", {
      timeout: 20_000,
    });
    await bw.getByRole("button", { name: "Tes Cetak" }).click();
    await expect(bw.getByTestId("share-target")).toContainText("1 cetakan menunggu", {
      timeout: 15_000,
    });
    await bw.screenshot({ path: "test-results/print-share-booth-offline.png" });
    hub = await launch(hubData);
    await expect.poll(() => inbox(hubData).length, { timeout: 30_000 }).toBe(2);
    await expect(bw.getByTestId("share-target")).toContainText("Tidak ada antrean", {
      timeout: 15_000,
    });
  } finally {
    await booth?.close().catch(() => {});
    await hub.close().catch(() => {});
  }
});
