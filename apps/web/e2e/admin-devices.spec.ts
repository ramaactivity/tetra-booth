import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** A2: daftarkan booth dari admin → kode → booth pairing → kartu online → nonaktifkan. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("daftarkan device, pairing, status online, nonaktifkan", async ({ page, request }) => {
  const u = await makeUser("owner");
  const name = `e2e booth ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await login(page, u);
    await page.getByRole("link", { name: "Device" }).click();
    await page.getByRole("button", { name: "+ Daftarkan Device" }).click();
    await page.getByPlaceholder(/Nama booth/).fill(name);
    await page.getByRole("button", { name: "Daftarkan", exact: true }).click();
    const panel = page.getByTestId("pair-code");
    await expect(panel).toContainText(name);
    const code = (await panel.locator("span.font-mono").allTextContents()).join("");
    expect(code).toMatch(/^\d{6}$/);

    const pair = await request.post("/api/booth/pair", {
      headers: { "x-forwarded-for": `e2e-admin-${code}` },
      data: { code },
    });
    expect(pair.status()).toBe(200);
    const { token } = await pair.json();
    await request.post("/api/booth/heartbeat", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        appVersion: "9.9.9",
        status: { printer: "ready", paper: { remaining: 12 }, uploadPending: 3 },
      },
    });
    await page.reload();
    const card = page.getByTestId("device-card").filter({ hasText: name });
    await expect(card).toContainText("● Online");
    await expect(card).toContainText("v9.9.9");
    await expect(card).toContainText("Kertas tinggal 12 lembar");
    await expect(card).toContainText("3 file");
    await page.screenshot({ path: "test-results/admin-devices.png", fullPage: true });

    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(page.getByTestId("device-card").filter({ hasText: name })).toHaveCount(0);
    const hb = await request.post("/api/booth/heartbeat", {
      headers: { Authorization: `Bearer ${token}` },
      data: { appVersion: "x" },
    });
    expect(hb.status()).toBe(401);
  } finally {
    await db.from("devices").delete().eq("name", name);
    await u.cleanup();
  }
});
