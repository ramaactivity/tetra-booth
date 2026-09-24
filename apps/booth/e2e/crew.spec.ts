import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/** Mode crew (M6) end-to-end: hotspot → PIN → event bundle → kertas → peringatan → kunci PIN. */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
// PNG 1×1 transparan: overlay bundle uji.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function makeData() {
  const data = mkdtempSync(join(tmpdir(), "tb-e2e-"));
  const dir = join(data, "events", "andi-sari", "bundle");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "overlay.png"), PNG);
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      id: "andi-sari",
      name: "Andi & Sari",
      date: "12 Oktober 2026",
      layout: {
        id: "l1",
        version: 1,
        paper: "4R",
        canvas: { width: 1200, height: 1800, dpi: 300 },
        slots: [{ id: "a", x: 100, y: 100, w: 1000, h: 667, fit: "cover", z: "below_overlay" }],
        overlay: { assetId: "ov" },
        texts: [],
      },
      assets: { ov: "overlay.png" },
    }),
  );
  return data;
}

const openCrew = async (w: Page) => {
  const hot = w.getByTestId("crew-hotspot");
  for (let i = 0; i < 5; i++) await hot.click();
};
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};

test("mode crew: PIN, pilih event, kertas, peringatan, kunci", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", "--no-spawn", `--data=${makeData()}`],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();

  // Buat PIN pertama kali (dua kali).
  await openCrew(w);
  await expect(w.getByText("Buat PIN crew")).toBeVisible();
  await typePin(w, "2468");
  await expect(w.getByText("Ulangi PIN")).toBeVisible();
  await typePin(w, "2468");
  await expect(w.getByRole("heading", { name: "Mode crew" })).toBeVisible();

  // Pilih event dari bundle lokal → attract menampilkan nama event.
  await w.getByRole("button", { name: "Ganti Event" }).click();
  await w.getByRole("button", { name: /Andi & Sari/ }).click();
  await w.getByRole("button", { name: /ganti roll/i }).click();
  await w.getByRole("textbox").fill("25");
  await w.getByRole("button", { name: /simpan/i }).click();
  await expect(w.getByText(/Kertas 25 \/ 25 lembar/)).toBeVisible();
  await w.screenshot({ path: "test-results/crew-menu.png" });
  await w.getByRole("button", { name: /keluar ke mode tamu/i }).click();

  await expect(w.getByRole("heading", { name: "Andi & Sari" })).toBeVisible();
  await expect(w.getByTestId("printer-alert")).toContainText("Kertas hampir habis (25)");

  // PIN salah 5x → terkunci; PIN benar pun ditolak saat terkunci.
  await openCrew(w);
  await expect(w.getByText("Masukkan PIN crew")).toBeVisible();
  for (let i = 0; i < 5; i++) await typePin(w, "0000");
  await expect(w.getByText(/Terlalu banyak salah/)).toBeVisible();
  await w.screenshot({ path: "test-results/crew-locked.png" });

  await app.close();
});

test("kiosk: layar penuh, kursor tersembunyi, pulih dari crash renderer", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const data = makeData();
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--kiosk", "--camera=simulated", "--no-spawn", `--data=${data}`],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
  expect(
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isKiosk()),
  ).toBe(true);
  // Kursor tersembunyi juga di atas tombol (M-011).
  const start = w.getByRole("button", { name: /sentuh untuk mulai/i });
  expect(await start.evaluate((b) => getComputedStyle(b).cursor)).toBe("none");

  // Renderer crash → dimuat ulang, attract kembali, sesi tidak mulai sendiri (M-011, W-016).
  // Page Playwright tidak bisa dipakai setelah crash: pantau log harian booth.
  const log = () =>
    readdirSync(join(data, "logs"))
      .map((f) => readFileSync(join(data, "logs", f), "utf8"))
      .join("");
  const boots = () => (log().match(/R-INFO \[boot\] kamera=/g) ?? []).length;
  expect(boots()).toBe(1);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]?.webContents.forcefullyCrashRenderer(),
  );
  await expect.poll(boots, { timeout: 10_000 }).toBe(2);
  await new Promise((r) => setTimeout(r, 3000));
  expect(log()).toContain("renderer mati");
  expect(log()).not.toContain("[session] countdown");
  // app.close() ditolak kiosk (memang begitu); keluar paksa dari proses main.
  await app.evaluate(({ app }) => app.exit(0)).catch(() => {});
});

test("kiosk: tidak bisa ditutup, keluar hanya lewat mode crew", async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--kiosk", "--camera=simulated", "--no-spawn", `--data=${makeData()}`],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();

  // Tutup jendela (Alt+F4 / tombol X) ditolak.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  await w.waitForTimeout(500);
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);

  // Keluar lewat mode crew menutup aplikasi.
  await openCrew(w);
  await typePin(w, "1357");
  await typePin(w, "1357");
  await expect(w.getByText("Auto-start hanya di app hasil build")).toBeVisible();
  const closed = app.waitForEvent("close");
  await w.getByRole("button", { name: "Tutup Aplikasi", exact: true }).click();
  // Jendela tertutup di tengah klik: Playwright menolak klik itu, yang penting event close datang.
  await w
    .getByRole("button", { name: "Ya, Tutup Aplikasi" })
    .click()
    .catch(() => {});
  await closed;
});
