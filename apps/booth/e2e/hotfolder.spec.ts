import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/** M7: kamera hot folder lewat Camera Service. Butuh `dotnet build services/camera`; tanpa itu dilewati. */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const serviceBin = join(
  appDir,
  "../../services/camera/TetraCamera.Host/bin/Debug/net10.0",
  process.platform === "win32" ? "TetraCamera.exe" : "TetraCamera",
);

test("hot folder: 3 JPEG yang masuk folder jadi 3 foto sesi", async () => {
  test.skip(!existsSync(serviceBin), "Camera Service belum di-build");
  const data = mkdtempSync(join(tmpdir(), "tb-hf-"));
  const hot = join(data, "hot");
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=hotfolder", "--hot-folder", hot, "--data", data],
    env: env as Record<string, string>,
  });
  const w = await app.firstWindow();
  await w.getByRole("button", { name: /sentuh untuk mulai/i }).click();

  // JPEG asli dibuat lewat nativeImage Electron (tanpa dependensi encoder tambahan).
  const jpeg = async (n: number) =>
    Buffer.from(
      await app.evaluate(({ nativeImage }, n) => {
        const [wd, ht] = [1200, 800];
        const px = Buffer.alloc(wd * ht * 4);
        for (let i = 0; i < px.length; i += 4) px.set([40 * n, 90, 160, 255], i);
        return nativeImage
          .createFromBitmap(px, { width: wd, height: ht })
          .toJPEG(90)
          .toString("base64");
      }, n),
      "base64",
    );

  for (let i = 1; i <= 3; i++) {
    await expect(w.getByText(`Foto ${i} dari 3`)).toBeVisible();
    await expect(w.getByText("Lihat ke kamera")).toBeVisible();
    // Masuk jendela toleransi 2 detik sebelum capture diminta (countdown 3 detik).
    await w.waitForTimeout(1800);
    writeFileSync(join(hot, `IMG_000${i}.JPG`), await jpeg(i));
    if (i < 3) await expect(w.getByText(`Foto ${i + 1} dari 3`)).toBeVisible({ timeout: 10_000 });
  }
  await expect(w.getByRole("heading", { name: "Cek fotonya dulu" })).toBeVisible({
    timeout: 15_000,
  });
  await w.screenshot({ path: "test-results/hotfolder-review.png" });

  const sessions = readdirSync(join(data, "sessions"));
  expect(sessions).toHaveLength(1);
  expect(readdirSync(join(data, "sessions", sessions[0] ?? "", "raw")).sort()).toEqual([
    "1.jpg",
    "2.jpg",
    "3.jpg",
  ]);
  await app.close();
});
