import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** #167: admin di HP/tablet — sidebar jadi drawer dari top bar, halaman tidak geser ke samping. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test.use({ viewport: { width: 390, height: 844 } });

test("drawer: buka, navigasi, tutup (Esc, scrim, tautan)", async ({ page }) => {
  const u = await makeUser("owner");
  try {
    await login(page, u);
    const menu = page.getByRole("button", { name: "Buka menu" });
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(page.getByRole("link", { name: "Template" })).toBeHidden();

    await menu.click();
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Keluar" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");
    await page.screenshot({ path: "test-results/admin-mobile-drawer.png", animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.overflow)).toBe("");

    await menu.click();
    await page.mouse.click(370, 400); // scrim di kanan panel 280 px
    await expect(drawer).toBeHidden();

    await menu.click();
    await drawer.getByRole("link", { name: "Device" }).click();
    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(/\/admin\/devices$/);
    await menu.click();
    await expect(drawer.getByRole("link", { name: "Device" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // Diputar/dilebarkan ke ≥ lg saat terbuka: drawer tertutup, sidebar biasa bisa diklik.
    await page.setViewportSize({ width: 1100, height: 844 });
    await expect(drawer).toHaveCount(0);
    await page.getByRole("link", { name: "Tim" }).click();
    await expect(page).toHaveURL(/\/admin\/team$/);
  } finally {
    await u.cleanup();
  }
});

test("tidak ada scroll horizontal di 390 & 768", async ({ page }) => {
  test.setTimeout(180_000);
  const u = await makeUser("owner");
  const { data: ev } = await db
    .from("events")
    .insert({ organization_id: u.org, name: "e2e mobile", mode: "event", event_date: "2026-10-12" })
    .select("id")
    .single();
  const id = ev?.id ?? "";
  try {
    await login(page, u);
    const paths = [
      "/admin",
      "/admin/photobox",
      "/admin/templates",
      "/admin/devices",
      "/admin/transactions",
      "/admin/team",
      `/admin/events/${id}`,
      `/admin/events/${id}/settings`,
      "/admin/events/new",
    ];
    for (const w of [390, 768]) {
      await page.setViewportSize({ width: w, height: w === 390 ? 844 : 1024 });
      for (const p of paths) {
        await page.goto(p);
        await page.waitForLoadState("networkidle");
        const name = p.replace(id, "id").replaceAll("/", "-").slice(1);
        await page.screenshot({ path: `test-results/mobile-${w}-${name}.png`, fullPage: true });
        const [sw, iw] = await page.evaluate(() => [
          document.documentElement.scrollWidth,
          window.innerWidth,
        ]);
        expect.soft(sw, `${p} @${w}`).toBeLessThanOrEqual(iw);
      }
    }
  } finally {
    await db.from("events").delete().eq("id", id);
    await u.cleanup();
  }
});
