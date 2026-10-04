import { expect, type Page } from "@playwright/test";

/**
 * Wizard Buat Template (#160) dari halaman Template: mode → kertas & arah → mulai dari → nama → (event) → editor.
 * Bawaan: mode tab aktif, 4R portrait, tata letak 4R Grid, tanpa pasang ke event.
 */
export async function createTemplateViaWizard(
  page: Page,
  o: {
    name: string;
    mode?: "Event" | "Photobox";
    paper?: "Strip 2R" | "Foto 4R" | "Polaroid";
    landscape?: boolean;
    /** Nama kartu tata letak / template sumber. */
    source?: RegExp;
    /** Nama event + harga (photobox) untuk langkah Pasang ke event. */
    event?: { name: string; price?: string };
    /** Simpan screenshot tiap langkah ke test-results/<shot>-<n>.png. */
    shot?: string;
  },
) {
  let n = 0;
  const snap = async () => {
    if (o.shot) await page.screenshot({ path: `test-results/${o.shot}-${++n}.png` });
  };
  await page.getByRole("button", { name: "Buat Template" }).click();
  const dlg = page.getByRole("dialog", { name: "Buat template" });
  if (o.mode) await dlg.getByText(o.mode, { exact: true }).click();
  await snap();
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  if (o.paper) await dlg.getByText(o.paper, { exact: true }).click();
  if (o.landscape) await dlg.getByRole("button", { name: /^Landscape/ }).click();
  await snap();
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  if (o.source) await dlg.getByRole("radio", { name: o.source }).check({ force: true });
  if (o.shot) await expect(dlg.locator("label img").first()).toBeVisible({ timeout: 15_000 });
  await snap();
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  await dlg.getByLabel("Nama template").fill(o.name);
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  if (o.event) {
    await dlg.getByRole("combobox", { name: "Pasang ke event" }).click();
    await page.getByRole("option", { name: new RegExp(o.event.name) }).click();
    if (o.event.price) await dlg.getByLabel("Harga paket (Rp)").fill(o.event.price);
  }
  await snap();
  await dlg.getByRole("button", { name: "Buat & buka editor" }).click();
  await expect(page.getByLabel("Nama template")).toHaveValue(o.name, { timeout: 30_000 });
}
