import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

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
  await expect(w.getByTestId("tv-status")).toHaveText("TV tersambung");
  await expect(tvWin.getByText("Foto dari pelaminan akan tampil di sini")).toBeVisible();
  await expect(w.getByText("Menunggu jepretan fotografer…")).toBeVisible();

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
  // Folder pantau baru dipasang saat layar stage terbuka; beri waktu satu putaran pindai.
  await w.waitForTimeout(800);
  writeFileSync(join(hot, "DSC0001.JPG"), await jpeg(1));
  writeFileSync(join(hot, "DSC0002.JPG"), await jpeg(2));
  await expect(w.locator("section").getByText("Rombongan #1")).toBeVisible({ timeout: 10_000 });
  await expect(w.locator("section img")).toHaveCount(2, { timeout: 10_000 });

  // Rombongan baru (Enter), nama diisi sebelum foto masuk.
  await w.keyboard.press("Enter");
  await expect(w.locator("section").getByText("Rombongan #2")).toBeVisible();
  await w.getByLabel("Nama grup (boleh kosong)", { exact: true }).fill("Keluarga Besar Bpk. Hadi");
  await w.keyboard.press("Enter"); // simpan nama (blur), bukan rombongan baru
  await expect(w.locator("section").getByText("Rombongan #2")).toBeVisible();
  writeFileSync(join(hot, "DSC0003.JPG"), await jpeg(3));
  await expect(w.locator("section img")).toHaveCount(1, { timeout: 10_000 });
  await w.screenshot({ path: "test-results/stage-operator.png" });
  // TV: rombongan terbaru (nama grup + QR), rombongan #1 di "Rombongan sebelumnya".
  await expect(tvWin.getByRole("heading", { name: "Keluarga Besar Bpk. Hadi" })).toBeVisible();
  await expect(tvWin.getByText("Scan untuk ambil fotomu")).toBeVisible();
  await expect(tvWin.getByText("Rombongan sebelumnya")).toBeVisible();
  await expect(tvWin.locator("img")).toHaveCount(1, { timeout: 10_000 });
  await tvWin.screenshot({ path: "test-results/stage-tv.png" });

  // Rombongan #1 sudah ditutup → diproses & tersimpan.
  await expect(w.getByText("tersimpan")).toHaveCount(1, { timeout: 15_000 });
  const sessions = readdirSync(join(data, "sessions")).filter((d) => !d.startsWith("_"));
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
  const next = w.getByTestId("stage-next");
  await expect(next).toContainText("0/3 grup sudah");
  await next.getByRole("button", { name: "Keluarga Inti" }).click();
  await expect(w.getByLabel("Nama grup (boleh kosong)", { exact: true })).toHaveValue(
    "Keluarga Inti",
  );
  await expect(next.getByRole("button", { name: "Keluarga Inti" })).toHaveCount(0);
  await expect(next).toContainText("1/3 grup sudah");
  // Rombongan kedua dari daftar: rombongan aktif masih kosong → nama diganti, bukan rombongan baru.
  await next.getByRole("button", { name: "Keluarga Besar Bpk. Hadi" }).click();
  await expect(w.getByLabel("Nama grup (boleh kosong)", { exact: true })).toHaveValue(
    "Keluarga Besar Bpk. Hadi",
  );
  await w.screenshot({ path: "test-results/stage-list.png" });
  await app.close();
});
