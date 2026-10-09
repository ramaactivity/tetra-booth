import { expect, test } from "@playwright/test";

/** Landing booth.tetraphoto.com (#244): dua pintu (acara & vendor), tujuan tombol benar, rapi di HP & desktop. */
test("landing: dua pintu, booking & demo WA", async ({ page }) => {
  for (const [w, h, name] of [
    [1440, 900, "desktop"],
    [390, 844, "mobile"],
  ] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("langsung jadi kenangan");
    await expect(page.getByRole("link", { name: /Saya mau sewa/ })).toHaveAttribute(
      "href",
      "#acara",
    );
    await expect(page.getByRole("link", { name: /Saya vendor photobooth/ })).toHaveAttribute(
      "href",
      "#vendor",
    );
    await expect(page.getByRole("link", { name: "Minta demo" })).toHaveAttribute(
      "href",
      /wa\.me\/6285213526630\?text=/,
    );
    await expect(page.getByRole("link", { name: /Cek tanggal & harga/ }).first()).toHaveAttribute(
      "href",
      "https://booking.tetraphoto.com/",
    );
    // Tidak ada scroll horizontal di HP.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(w);
    await page.screenshot({ path: `test-results/landing-${name}.png`, fullPage: true });
  }
});
