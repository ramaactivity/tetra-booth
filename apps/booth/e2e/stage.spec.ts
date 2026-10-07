import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, _electron as electron, expect, test } from "@playwright/test";

/**
 * Photo Stage S1 (#178): laptop berperan stage + kamera folder pantau. Jepretan "fotografer" (JPEG yang masuk folder)
 * terkelompok per rombongan, nama grup bisa diisi sebelum foto masuk, rombongan ditutup diproses jadi sesi
 * (original + thumb). Butuh `dotnet build services/camera`; tanpa itu dilewati.
 */
const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const serviceBin = join(
  appDir,
  "../../services/camera/TetraCamera.Host/bin/Debug/net10.0",
  process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
);

/** Lanjutkan wizard dari tombol `from` sampai selesai. */
async function skipSetupFrom(w: import("@playwright/test").Page, from: string) {
  const setup = w.getByTestId("stage-setup");
  const steps = ["Lanjut ke Kamera", "Lanjut ke TV", "Lanjut ke Warna"];
  for (const name of steps.slice(steps.indexOf(from)))
    await setup.getByRole("button", { name }).click();
  await setup.getByRole("button", { name: "Pakai untuk semua foto" }).click();
  await setup.getByRole("button", { name: "Mulai Photo Stage" }).click();
  await expect(setup).toBeHidden();
}

/** Wizard persiapan (#188) sekali per event: lewati semua langkah. */
async function skipSetup(w: import("@playwright/test").Page) {
  const setup = w.getByTestId("stage-setup");
  for (const name of ["Lanjut ke Kamera", "Lanjut ke TV", "Lanjut ke Warna"])
    await setup.getByRole("button", { name }).click();
  await setup.getByRole("button", { name: "Pakai untuk semua foto" }).click();
  await setup.getByRole("button", { name: "Mulai Photo Stage" }).click();
  await expect(setup).toBeHidden();
}

test("stage: jepretan fotografer → rombongan → sesi tersimpan", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  test.setTimeout(90_000);
  const data = mkdtempSync(join(tmpdir(), "tb-stage-"));
  const hot = join(data, "hot");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=hotfolder",
      "--hot-folder",
      hot,
      "--role",
      "stage",
      "--tv-window",
      "--data",
      data,
    ],
    env: env as Record<string, string>,
  });
  // Dua jendela: operator + TV (#179, `--tv-window` = TV di layar utama untuk uji).
  await expect.poll(() => app.windows().length, { timeout: 15_000 }).toBe(2);
  const byHash = async (tv: boolean) => {
    for (const x of app.windows()) if (x.url().endsWith("#tv") === tv) return x;
    throw new Error("jendela tidak ditemukan");
  };
  const w = await byHash(false);
  const tvWin = await byHash(true);
  await expect(w.getByTestId("stage-runner")).toBeVisible();
  const jpeg = async (n: number) =>
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
  // Wizard persiapan (#188): foto tes tidak masuk rombongan, layar uji tampil di TV.
  const setup = w.getByTestId("stage-setup");
  await expect(setup.getByText("Laptop ini untuk apa?")).toBeVisible();
  await w.screenshot({ path: "test-results/stage-setup-1.png" });
  await setup.getByRole("button", { name: "Lanjut ke Kamera" }).click();
  await w.waitForTimeout(800); // folder pantau dipasang saat layar stage terbuka
  writeFileSync(join(hot, "DSC0000.JPG"), await jpeg(5));
  await expect(setup.getByText("Foto tes masuk")).toBeVisible({ timeout: 10_000 });
  await w.screenshot({ path: "test-results/stage-setup-2.png" });
  await setup.getByRole("button", { name: "Lanjut ke TV" }).click();
  await setup.getByRole("button", { name: "Tampilkan uji di TV" }).click();
  await expect(tvWin.getByText("Uji tampilan TV")).toBeVisible();
  await setup.getByRole("button", { name: "Lanjut ke Warna" }).click();
  await setup.getByRole("button", { name: "Pakai untuk semua foto" }).click();
  await w.screenshot({ path: "test-results/stage-setup-5.png" });
  await setup.getByRole("button", { name: "Mulai Photo Stage" }).click();
  await expect(setup).toBeHidden();
  await expect(w.getByTestId("tv-status")).toHaveText("TV");
  await expect(tvWin.getByText("Foto dari pelaminan akan tampil di sini")).toBeVisible();
  await expect(w.getByText("Menunggu jepretan fotografer", { exact: true })).toBeVisible();
  writeFileSync(join(hot, "DSC0001.JPG"), await jpeg(1));
  writeFileSync(join(hot, "DSC0002.JPG"), await jpeg(2));
  await expect(w.locator("section").getByText("#1", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(w.locator("section img")).toHaveCount(2, { timeout: 10_000 });

  // Rombongan baru (Enter), nama diisi sebelum foto masuk.
  await w.keyboard.press("Enter");
  await expect(w.locator("section").getByText("#2", { exact: true })).toBeVisible();
  await w.getByLabel("Nama grup (boleh kosong)", { exact: true }).fill("Keluarga Besar Bpk. Hadi");
  await w.keyboard.press("Enter"); // simpan nama (blur), bukan rombongan baru
  await expect(w.locator("section").getByText("#2", { exact: true })).toBeVisible();
  writeFileSync(join(hot, "DSC0003.JPG"), await jpeg(3));
  await expect(w.locator("section img")).toHaveCount(1, { timeout: 10_000 });
  await w.screenshot({ path: "test-results/stage-operator.png" });
  // TV: rombongan terbaru (nama grup + QR), rombongan #1 di "Rombongan sebelumnya".
  await expect(tvWin.getByRole("heading", { name: "Keluarga Besar Bpk. Hadi" })).toBeVisible();
  await expect(tvWin.getByText("Scan untuk ambil fotomu")).toBeVisible();
  await expect(tvWin.getByText("Rombongan sebelumnya")).toBeVisible();
  // Lapisan aktif (B4): 1 foto rombongan #2; galeri idle tetap ter-mount di belakang (#189).
  await expect(tvWin.locator('[aria-hidden="false"] img')).toHaveCount(1, { timeout: 10_000 });
  await tvWin.screenshot({ path: "test-results/stage-tv.png" });
  // Layar WiFi (#205): browser device lain membuka laptop stage → TV yang sama tanpa internet.
  let lan = "";
  for (const port of [47870, 47871, 47872]) {
    const st = await fetch(`http://127.0.0.1:${port}/api/tv`)
      .then((r) => r.json() as Promise<{ eventName?: string } | null>)
      .catch(() => null);
    if (st?.eventName) {
      lan = `http://127.0.0.1:${port}/`;
      break;
    }
  }
  expect(lan).not.toBe("");
  const browser = await chromium.launch();
  const other = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await other.goto(lan);
  await expect(other.getByRole("heading", { name: "Keluarga Besar Bpk. Hadi" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(other.locator('[aria-hidden="false"] img')).toHaveCount(1, { timeout: 15_000 });
  await other.screenshot({ path: "test-results/stage-lan.png" });
  await browser.close();

  // "Cari fotomu" (#200): tamu menyentuh TV → daftar rombongan → foto + QR → tutup.
  await tvWin.getByRole("button", { name: "Cari fotomu" }).click();
  await expect(tvWin.getByRole("heading", { name: "Cari fotomu" })).toBeVisible();
  await tvWin.getByRole("button", { name: /Keluarga Besar Bpk\. Hadi/ }).click();
  const find = tvWin.getByTestId("stage-tv-find");
  await expect(find.getByRole("button", { name: "Semua rombongan" })).toBeVisible();
  await expect(find.getByRole("img", { name: /\/s\// })).toBeVisible();
  await tvWin.screenshot({ path: "test-results/stage-tv-find.png" });
  await tvWin.getByRole("button", { name: "Tutup" }).click();
  await expect(tvWin.getByRole("heading", { name: "Cari fotomu" })).toHaveCount(0);

  // Cetak instan 4R (#183): foto landscape → lembar 4R lewat antrean print booth.
  await w.locator("section").getByRole("button", { name: "Cetak 4R" }).click();
  await expect(w.locator("section").getByRole("button", { name: /Dicetak|Gagal/ })).toBeVisible({
    timeout: 15_000,
  });
  const printed = readdirSync(join(data, "sessions"), { recursive: true })
    .map(String)
    .filter((f) => /out[/\\]print_\w+\.jpg$/.test(f));
  expect(printed).toHaveLength(1);
  const size = await app.evaluate(
    ({ nativeImage }, f) => nativeImage.createFromPath(f).getSize(),
    join(data, "sessions", printed[0] ?? ""),
  );
  expect([size.width, size.height].sort()).toEqual([1200, 1800]);
  copyFileSync(join(data, "sessions", printed[0] ?? ""), "test-results/stage-print.jpg");
  await w.screenshot({ path: "test-results/stage-printed.png" });

  // Rombongan #1 sudah ditutup → diproses & tersimpan.
  await expect(w.getByText(/^(terunggah|mengunggah|antre)$/)).toHaveCount(1, { timeout: 15_000 });
  // Foto diproses begitu masuk (#202): rombongan #2 (aktif, 1 foto) juga sudah punya original_1; #1 punya 2 foto.
  const sessions = readdirSync(join(data, "sessions")).filter((d) =>
    existsSync(join(data, "sessions", d, "out", "original_2.jpg")),
  );
  expect(sessions).toHaveLength(1);
  expect(readdirSync(join(data, "sessions", sessions[0] ?? "", "out")).sort()).toEqual([
    "original_1.jpg",
    "original_2.jpg",
    "thumb_original_1.jpg",
    "thumb_original_2.jpg",
  ]);

  // Warna: filter Hitam Putih tersimpan per event.
  await w.getByRole("button", { name: "Warna" }).click();
  const dlg = w.getByRole("dialog", { name: "Warna foto stage" });
  await dlg.getByRole("button", { name: "Hitam Putih" }).click();
  await w.screenshot({ path: "test-results/stage-color.png" });
  await dlg.getByRole("button", { name: "Selesai" }).click();
  await expect(dlg).toBeHidden();

  // LUT .cube (#184): LUT invers dipasang, rombongan #2 diproses dengan LUT (biru 200 → 55).
  const rows = ["LUT_3D_SIZE 2"];
  for (const b of [0, 1])
    for (const g of [0, 1]) for (const r of [0, 1]) rows.push(`${1 - r} ${1 - g} ${1 - b}`);
  await w.getByRole("button", { name: "Warna" }).click();
  await dlg.getByRole("button", { name: "Kembalikan" }).click();
  await dlg.locator("input[type=file]").setInputFiles({
    name: "invert.cube",
    mimeType: "text/plain",
    buffer: Buffer.from(rows.join("\n")),
  });
  await expect(dlg.getByTestId("stage-lut")).toContainText("invert.cube");
  await w.waitForTimeout(800); // foto tes sebelum/sesudah dirender ulang dengan LUT
  await w.screenshot({ path: "test-results/stage-lut.png" });
  await dlg.getByRole("button", { name: "Selesai" }).click();
  // Foto berikutnya rombongan #2 diproses dengan LUT (yang sudah masuk sebelumnya tidak berubah).
  writeFileSync(join(hot, "DSC0004.JPG"), await jpeg(3));
  await expect(w.locator("section img")).toHaveCount(2, { timeout: 10_000 });
  await w.keyboard.press("Enter");
  await expect(w.getByText(/^(terunggah|mengunggah|antre)$/)).toHaveCount(2, { timeout: 15_000 });
  const second = readdirSync(join(data, "sessions")).find(
    (d) => d !== sessions[0] && existsSync(join(data, "sessions", d, "out", "original_1.jpg")),
  );
  await expect
    .poll(() => existsSync(join(data, "sessions", second ?? "", "out", "original_2.jpg")))
    .toBe(true);
  const px = await app.evaluate(
    ({ nativeImage }, f) => {
      const img = nativeImage.createFromPath(f);
      const { width, height } = img.getSize();
      const bmp = img.toBitmap();
      const i = 4 * (Math.floor(height / 2) * width + Math.floor(width / 2));
      return [bmp[i], bmp[i + 1], bmp[i + 2]];
    },
    join(data, "sessions", second ?? "", "out", "original_2.jpg"),
  );
  // Asal [120,120,200] → invers [135,135,55]; urutan kanal bitmap tergantung OS.
  expect([...px].sort((a, b) => (a ?? 0) - (b ?? 0))[0]).toBeLessThan(80);

  // Riwayat (#195): sembunyikan foto #1, penjaga "sisakan 1 foto", gabung #2 ke #1.
  const hist = w.getByTestId("stage-history-row");
  await hist.filter({ hasText: "#1 ·" }).getByRole("button").first().click();
  const row1 = hist.filter({ hasText: "#1 ·" });
  await row1.getByRole("button", { name: "Foto 2" }).click();
  await row1.getByRole("button", { name: "Sembunyikan" }).click();
  await expect(w.getByText("1 foto disembunyikan dari tamu & galeri")).toBeVisible();
  await expect(row1).toContainText("1 foto · 1 disembunyikan");
  await row1.getByRole("button", { name: "Foto 1" }).click();
  await row1.getByRole("button", { name: "Pisah 1 foto" }).click();
  await expect(w.getByText("Sisakan minimal 1 foto di rombongan ini")).toBeVisible();
  await w.screenshot({ path: "test-results/stage-history.png" });
  await w.keyboard.press("Escape");
  await hist.filter({ hasText: "#2 ·" }).getByRole("button").first().click();
  await hist.filter({ hasText: "#2 ·" }).getByRole("button", { name: "Gabung ke #1" }).click();
  await expect(w.getByText("#2 digabung ke #1")).toBeVisible({ timeout: 15_000 });
  await expect(hist.filter({ hasText: "#2 ·" })).toHaveCount(0);
  await expect(hist.filter({ hasText: "#1 ·" })).toContainText("3 foto · 1 disembunyikan");
  await expect
    .poll(() => readdirSync(join(data, "sessions", sessions[0] ?? "", "out")))
    .toEqual(expect.arrayContaining(["original_3.jpg", "original_4.jpg"]));
  await app.close();
});

test("stage: daftar grup dari klien jadi pilihan cepat nama rombongan (#181)", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  test.setTimeout(90_000);
  const data = mkdtempSync(join(tmpdir(), "tb-stage-list-"));
  const hot = join(data, "hot");
  const dir = join(data, "events", "rina-dimas", "bundle");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "config.json"),
    JSON.stringify({
      id: "rina-dimas",
      name: "Rina & Dimas",
      date: "12 Desember 2026",
      layout: {
        id: "l",
        version: 1,
        paper: "4R",
        canvas: { width: 1200, height: 1800, dpi: 300 },
        background: { color: "#ffffff" },
        slots: [{ id: "s", x: 0, y: 0, w: 1200, h: 1800, fit: "cover", z: "below_overlay" }],
        texts: [],
      },
      settings: {
        stageGroups: ["Keluarga Inti", "Keluarga Besar Bpk. Hadi", "Teman Kantor PT ABC"],
      },
    }),
  );
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [
      appDir,
      "--camera=hotfolder",
      "--hot-folder",
      hot,
      "--role",
      "stage",
      "--start-screen",
      "--data",
      data,
    ],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await w.getByRole("button", { name: /Mode Event/ }).click();
  await w.getByRole("button", { name: /Rina & Dimas/ }).click();
  await skipSetup(w);
  const next = w.getByTestId("stage-next");
  await expect(next).toContainText("0/3");
  await next.getByRole("button", { name: "Keluarga Inti" }).click();
  await expect(w.getByLabel("Nama grup (boleh kosong)", { exact: true })).toHaveValue(
    "Keluarga Inti",
  );
  await expect(next.getByRole("button", { name: "Keluarga Inti" })).toHaveCount(0);
  await expect(next).toContainText("1/3");
  // Rombongan kedua dari daftar: rombongan aktif masih kosong → nama diganti, bukan rombongan baru.
  await next.getByRole("button", { name: "Keluarga Besar Bpk. Hadi" }).click();
  await expect(w.getByLabel("Nama grup (boleh kosong)", { exact: true })).toHaveValue(
    "Keluarga Besar Bpk. Hadi",
  );
  await w.screenshot({ path: "test-results/stage-list.png" });
  await app.close();
});

test("stage: jepret dari laptop dengan Canon (#201)", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  test.setTimeout(90_000);
  const data = mkdtempSync(join(tmpdir(), "tb-stage-canon-"));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=canon", "--canon", "fake", "--role", "stage", "--data", data],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  const setup = w.getByTestId("stage-setup");
  await setup.getByRole("button", { name: "Lanjut ke Kamera" }).click();
  await setup.getByRole("button", { name: "Jepret dari laptop" }).click();
  await expect(setup.getByText("Foto tes masuk")).toBeVisible({ timeout: 15_000 });
  await skipSetupFrom(w, "Lanjut ke TV");
  await w.getByRole("button", { name: /^Jepret/ }).click();
  await expect(w.locator("section img")).toHaveCount(1, { timeout: 15_000 });
  await w.keyboard.press("j");
  await expect(w.locator("section img")).toHaveCount(2, { timeout: 15_000 });
  await app.close();
});
