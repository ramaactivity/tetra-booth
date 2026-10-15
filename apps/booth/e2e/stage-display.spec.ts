import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { networkInterfaces, tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";

/**
 * Layar galeri (#281): laptop 2 berperan "Layar galeri", mencari laptop Photo Stage lewat siaran UDP, kode salah
 * ditolak, kode benar → galeri tamu laptop stage tampil di sana. Laptop stage ditutup → "Menghubungkan…"; dibuka lagi
 * di port lain (IP/port berubah) → ditemukan lagi lewat id dan galeri kembali sendiri.
 */
const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const env: NodeJS.ProcessEnv = { ...process.env, TETRA_NO_SHELL_OPEN: "1" };
delete env.ELECTRON_RUN_AS_NODE;
const launch = (args: string[]) =>
  electron.launch({
    executablePath: electronPath,
    args: [appDir, "--use-mock-keychain", ...args],
    env: env as Record<string, string>,
  });
const launchStage = (data: string) =>
  launch([
    "--camera=hotfolder",
    "--hot-folder",
    join(data, "hot"),
    "--role",
    "stage",
    "--data",
    data,
  ]);
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};
const jpeg = async (app: ElectronApplication, n: number) =>
  Buffer.from(
    await app.evaluate(({ nativeImage }, n) => {
      const [wd, ht] = [1800, 1200];
      const px = Buffer.alloc(wd * ht * 4);
      for (let i = 0; i < px.length; i += 4) px.set([40 * n, 120, 200, 255], i);
      return nativeImage
        .createFromBitmap(px, { width: wd, height: ht })
        .toJPEG(90)
        .toString("base64");
    }, n),
    "base64",
  );
const STEPS = ["Lanjut ke Kamera", "Lanjut ke TV", "Lanjut ke Warna", "Pakai untuk semua foto"];
/** Lanjutkan wizard persiapan stage (#188) dari tombol `from` sampai selesai. */
const finishSetup = async (w: Page, from: string) => {
  const setup = w.getByTestId("stage-setup");
  for (const name of STEPS.slice(STEPS.indexOf(from)))
    await setup.getByRole("button", { name }).click();
  await setup.getByRole("button", { name: "Lanjut ke Pemisah" }).click();
  await setup.getByRole("button", { name: "Mulai Photo Stage" }).click();
  await expect(setup).toBeHidden();
};
/** Wizard persiapan muncul sekali per event; kode layar galeri dibaca dari dialog "HP crew". */
const stageReady = async (w: Page) => {
  await expect(w.getByTestId("stage-runner")).toBeVisible({ timeout: 30_000 });
  if (await w.getByTestId("stage-setup").isVisible()) await finishSetup(w, STEPS[0] ?? "");
  await w.getByRole("button", { name: "HP crew" }).click();
  const url = (await w.getByTestId("stage-helper-url").textContent()) ?? "";
  await w.keyboard.press("Escape");
  const key = /#helper=(\d{4})/.exec(url)?.[1] ?? "";
  expect(key).toMatch(/^\d{4}$/);
  return key;
};
/** Port HTTP laptop stage uji ini (laptop stage lain di WiFi/Mac yang sama bisa ikut menjawab pencarian). */
const stagePort = async (key: string) => {
  for (const port of [47870, 47871, 47872]) {
    const r = await fetch(`http://127.0.0.1:${port}/api/ping?key=${key}`).catch(() => null);
    if (r?.ok) return port;
  }
  throw new Error("laptop stage tidak menjawab /api/ping");
};
const lanIps = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a && a.family === "IPv4" && !a.internal)
  .map((a) => a?.address.replaceAll(".", "\\.") ?? "");

test("layar galeri: cari laptop stage, kode, galeri tamu tampil, sambung ulang sendiri", async () => {
  test.setTimeout(240_000);
  const stageData = mkdtempSync(join(tmpdir(), "tb-stage-disp-"));
  const displayData = mkdtempSync(join(tmpdir(), "tb-display-"));
  let stage = await launchStage(stageData);
  const display = await launch(["--role", "display", "--size=1920x1080", `--data=${displayData}`]);
  let blocker: ReturnType<typeof createServer> | null = null;
  try {
    const sw = await stage.firstWindow();
    // Kode layar galeri tampil di langkah TV persiapan stage (sama dengan kode HP crew).
    const setup = sw.getByTestId("stage-setup");
    await setup.getByRole("button", { name: "Lanjut ke Kamera" }).click();
    await setup.getByRole("button", { name: "Lanjut ke TV" }).click();
    const shown = (await sw.getByTestId("stage-lan-key").textContent())?.trim();
    await sw.screenshot({ path: "test-results/stage-display-key.png" });
    await finishSetup(sw, "Lanjut ke Warna");
    const key = await stageReady(sw);
    expect(shown).toBe(key);
    const port = await stagePort(key);

    // Laptop 2: halaman Hubungkan, laptop stage ditemukan lewat siaran UDP.
    const dw = await display.firstWindow();
    const dsetup = dw.getByTestId("display-setup");
    await expect(dsetup).toBeVisible({ timeout: 30_000 });
    const mine = dw
      .getByTestId("display-stage-choice")
      .filter({ hasText: new RegExp(`(${lanIps.join("|")}):${port}$`) });
    await expect(mine).toHaveCount(1, { timeout: 15_000 });
    await mine.click();
    await dw.screenshot({ path: "test-results/stage-display-setup.png" });
    // Kode salah ditolak.
    await dw.getByTestId("display-code").fill(key === "1000" ? "1001" : String(Number(key) - 1));
    await dw.getByRole("button", { name: "Hubungkan" }).click();
    await expect(dw.getByTestId("display-msg")).toHaveText(/Kode salah/);
    await dw.screenshot({ path: "test-results/stage-display-badkey.png" });
    // Kode benar → galeri tamu laptop stage di iframe layar penuh.
    await dw.getByTestId("display-code").fill(key);
    await dw.getByRole("button", { name: "Hubungkan" }).click();
    await expect(dw.getByTestId("display-frame")).toBeVisible({ timeout: 15_000 });
    const frame = dw.frameLocator("[data-testid=display-frame]");
    await expect(frame.getByText("Foto dari pelaminan akan tampil di sini")).toBeVisible({
      timeout: 15_000,
    });
    // Jepretan fotografer di laptop stage → tampil di layar galeri.
    // Folder pantau belum tentu sudah dibuat aplikasi (runner CI lebih lambat dari Mac): siapkan sendiri.
    mkdirSync(join(stageData, "hot"), { recursive: true });
    await new Promise((r) => setTimeout(r, 800)); // pemantau folder terpasang sesudah folder dibuat
    writeFileSync(join(stageData, "hot", "DSC0001.JPG"), await jpeg(stage, 1));
    await expect(frame.locator('[aria-hidden="false"] img')).toHaveCount(1, { timeout: 20_000 });
    await dw.screenshot({ path: "test-results/stage-display-gallery.png" });

    // Mode crew dari dalam galeri (fokus di iframe): Ctrl+Shift+M diteruskan halaman galeri.
    await dw.mouse.click(1150, 700);
    await expect.poll(() => dw.evaluate(() => document.activeElement?.tagName)).toBe("IFRAME");
    await dw.keyboard.press("Control+Shift+M");
    await typePin(dw, "2468");
    await typePin(dw, "2468");
    await dw.getByTestId("crew-nav-system").click();
    await expect(dw.getByTestId("display-target")).toContainText("Menampilkan galeri");
    await dw.getByTestId("display-target").scrollIntoViewIfNeeded();
    await dw.screenshot({ path: "test-results/stage-display-crew.png" });
    await dw.getByTestId("to-guest").click();
    await expect(dw.getByTestId("display-frame")).toBeVisible({ timeout: 15_000 });

    // Laptop stage mati → layar "Menghubungkan…".
    await stage.close();
    await expect(dw.getByTestId("display-reconnect")).toBeVisible({ timeout: 20_000 });
    await expect(dw.getByTestId("display-reconnect")).toContainText("Menghubungkan ke");
    await dw.screenshot({ path: "test-results/stage-display-reconnect.png" });

    // Dibuka lagi di port lain (port lama dipakai aplikasi lain = alamat berubah) → dicari ulang lewat id.
    blocker = createServer((_q, s) => s.writeHead(404).end());
    await new Promise<void>((r) => blocker?.listen(port, "0.0.0.0", r));
    stage = await launchStage(stageData);
    const key2 = await stageReady(await stage.firstWindow());
    expect(await stagePort(key2)).not.toBe(port);
    if (key2 !== key) {
      // Kode HP crew masih acak per jalan di laptop stage: layar galeri minta kode baru.
      await expect(dw.getByTestId("display-msg")).toHaveText(/berubah/, { timeout: 20_000 });
      await dw.getByTestId("display-code").fill(key2);
      await dw.getByRole("button", { name: "Hubungkan" }).click();
    }
    await expect(dw.getByTestId("display-frame")).toBeVisible({ timeout: 20_000 });
    await expect(frame.getByText("Foto dari pelaminan akan tampil di sini")).toBeVisible({
      timeout: 15_000,
    });
    // Jepretan setelah pulih juga sampai.
    await new Promise((r) => setTimeout(r, 800)); // pemantau folder dipasang ulang setelah stage dibuka lagi
    writeFileSync(join(stageData, "hot", "DSC0002.JPG"), await jpeg(stage, 2));
    await expect(frame.locator('[aria-hidden="false"] img')).toHaveCount(1, { timeout: 20_000 });
    await dw.screenshot({ path: "test-results/stage-display-recovered.png" });
  } finally {
    blocker?.close();
    await stage.close().catch(() => {});
    await display.close().catch(() => {});
  }
});
