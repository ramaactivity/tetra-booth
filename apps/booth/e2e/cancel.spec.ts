import { mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

/**
 * Batalkan sesi & perbesar foto (Rama 14 Okt, #272): tombol Batal selalu lewat konfirmasi; selama konfirmasi
 * hitung mundur berhenti; "Lanjut foto" melanjutkan sesi, "Ya, batalkan" kembali ke layar awal. Di cek foto,
 * ketuk foto = tampil besar, Tutup = kembali.
 */

const appDir = join(__dirname, "..");
const electronPath = createRequire(__filename)("electron") as unknown as string;

test("batal sesi lewat konfirmasi, hitung mundur tertahan; perbesar foto di cek foto", async () => {
  test.setTimeout(120_000);
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({
    executablePath: electronPath,
    args: [appDir, "--camera=simulated", `--data=${mkdtempSync(join(tmpdir(), "tb-cancel-"))}`],
    env: env as Record<string, string>,
  });
  try {
    const w = await app.firstWindow();
    const start = async () => {
      const b = w.getByRole("button", { name: /sentuh untuk mulai/i });
      await expect(b).toBeVisible();
      await w.waitForTimeout(1000); // START_GUARD_MS
      await b.click();
      await w.getByRole("button", { name: "Siap, mulai!" }).click();
      await expect(w.getByText("Foto 1 dari 3")).toBeVisible();
    };
    await start();

    // Batal → konfirmasi; hitung mundur (5 dtk) tertahan selama konfirmasi terbuka.
    await w.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(w.getByText("Batalkan sesi foto?")).toBeVisible();
    await w.screenshot({ path: "test-results/cancel-confirm.png" });
    await w.waitForTimeout(7000);
    await expect(w.getByText("Batalkan sesi foto?")).toBeVisible();
    await expect(w.getByText("Foto 1 dari 3")).toBeVisible();
    await w.getByRole("button", { name: "Lanjut foto" }).click();
    await expect(w.getByText("Batalkan sesi foto?")).toHaveCount(0);

    // Sesi lanjut sampai cek foto; foto bisa diperbesar lalu ditutup.
    await expect(w.getByRole("heading", { name: "Cek fotonya dulu" })).toBeVisible({
      timeout: 60_000,
    });
    await w.screenshot({ path: "test-results/cancel-review.png" });
    await w.getByRole("button", { name: "Perbesar foto 1" }).click();
    await expect(w.getByRole("button", { name: "Kembali ke cek foto" })).toBeVisible();
    await w.screenshot({ path: "test-results/review-zoom.png" });
    await w.getByRole("button", { name: "Tutup", exact: true }).click();
    await expect(w.getByRole("button", { name: "Kembali ke cek foto" })).toHaveCount(0);

    // Batal dari cek foto → Ya, batalkan → layar awal; sesi berikutnya mulai normal.
    await w.getByRole("button", { name: "Batal", exact: true }).click();
    await w.getByRole("button", { name: "Ya, batalkan" }).click();
    await expect(w.getByRole("button", { name: /sentuh untuk mulai/i })).toBeVisible();
    await start();
  } finally {
    await app.close();
  }
});
