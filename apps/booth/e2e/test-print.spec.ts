import { copyFileSync, existsSync, mkdtempSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, type Page, test } from "@playwright/test";

/**
 * Tes Cetak (#239): lembar kalibrasi (skala potongan, penggaris, warna, ketajaman, foto contoh) disusun di booth
 * dan ditulis ke `sessions/<id>/out/test.jpg` sebelum dikirim ke printer; file disalin ke test-results untuk dilihat.
 */
const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;
const typePin = async (w: Page, pin: string) => {
  for (const d of pin) await w.getByRole("button", { name: d, exact: true }).click();
  await w.getByRole("button", { name: "OK" }).click();
};
const findTest = (data: string) => {
  const root = join(data, "sessions");
  if (!existsSync(root)) return null;
  for (const id of readdirSync(root)) {
    const f = join(root, id, "out", "test.jpg");
    if (existsSync(f)) return f;
  }
  return null;
};

test("Tes Cetak menyusun lembar kalibrasi", async () => {
  test.setTimeout(90_000);
  const data = mkdtempSync(join(tmpdir(), "tb-testprint-"));
  const env: NodeJS.ProcessEnv = { ...process.env, TETRA_NO_SHELL_OPEN: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", "--no-spawn", `--data=${data}`, "--use-mock-keychain"],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    for (let i = 0; i < 5; i++) await w.getByTestId("crew-hotspot").click();
    await typePin(w, "2468");
    await typePin(w, "2468");
    await w.getByTestId("crew-nav-printer").click();
    await w.getByRole("button", { name: "Tes Cetak" }).click();
    await expect.poll(() => findTest(data), { timeout: 30_000 }).not.toBeNull();
    copyFileSync(findTest(data) as string, "test-results/test-print.jpg");
  } finally {
    await app.close();
  }
});
