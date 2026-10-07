import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
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
    args: [appDir, "--camera=hotfolder", "--hot-folder", hot, "--role", "stage", "--data", data],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await expect(w.getByTestId("stage-runner")).toBeVisible();
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
