import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/** Hasil berframe bisa diperbesar di layar pilih cetak & QR (masukan Rama 27 Nov 2026). */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;

test("ketuk hasil foto berframe di pilih cetak & QR → layar penuh, Tutup = kembali", async () => {
  test.setTimeout(120_000);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", `--data=${mkdtempSync(join(tmpdir(), "tb-zoom-"))}`],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    const b = w.getByRole("button", { name: /sentuh untuk mulai/i });
    await expect(b).toBeVisible();
    await w.waitForTimeout(1000); // START_GUARD_MS
    await b.click();
    await w.getByRole("button", { name: /pakai semua foto/i }).click({ timeout: 60_000 });

    const zoom = async (shot: string) => {
      await w.getByRole("button", { name: "Perbesar hasil foto" }).click({ timeout: 15_000 });
      await expect(w.getByTestId("strip-zoom").locator("img")).toBeVisible();
      await w.screenshot({ path: `test-results/${shot}.png` });
      await w.getByRole("button", { name: "Tutup", exact: true }).click();
      await expect(w.getByTestId("strip-zoom")).toHaveCount(0);
    };
    await zoom("print-select-zoom");
    await w.getByRole("button", { name: /cetak sekarang/i }).click();
    // Selama foto diperbesar di layar QR, hitung mundur kembali ke awal berhenti; ditutup = mulai lagi penuh.
    const left = () =>
      w
        .getByText(/Kembali ke awal dalam/)
        .locator("span")
        .textContent();
    await expect.poll(left, { timeout: 15_000 }).toMatch(/^\d+$/);
    await w.getByRole("button", { name: "Perbesar hasil foto" }).click();
    await w.waitForTimeout(4000);
    await w.getByRole("button", { name: "Tutup", exact: true }).click();
    expect(Number(await left())).toBe(45);
    await zoom("qr-zoom");
    await w.screenshot({ path: "test-results/qr-strip.png" });
    await w.getByRole("button", { name: "Selesai" }).click();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
  } finally {
    await app.close();
  }
});
