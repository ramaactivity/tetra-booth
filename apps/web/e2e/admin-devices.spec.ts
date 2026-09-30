import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** A2: daftarkan booth dari admin → kode → booth pairing → kartu online + status booth → nonaktifkan. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("daftarkan device, pairing, status online, nonaktifkan", async ({ page, request }) => {
  test.setTimeout(90_000);
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
    const beat = await request.post("/api/booth/heartbeat", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        appVersion: "9.9.9",
        status: {
          activeEvent: "andi-sari",
          activeEventName: "Andi & Sari",
          camera: { kind: "canon", connected: false, model: "Canon EOS 1500D" },
          printer: { name: "DNP DS-RX1", status: "error", message: "Paper end" },
          paper: { remaining: 12, capacity: 700 },
          failedPrints: 2,
          uploadPending: 3,
          lastError: "R2 PUT 503",
          diskFreeGb: 3.2,
        },
      },
    });
    expect(beat.status()).toBe(200);
    // Pantauan otomatis (tiap 20 dtk) tanpa reload manual.
    const card = page.getByTestId("device-card").filter({ hasText: name });
    await expect(card).toContainText("● Online", { timeout: 30_000 });
    await expect(card).toContainText("v9.9.9");
    await expect(card).toContainText("Andi & Sari");
    await expect(card).toContainText("Canon EOS 1500DTidak terhubung");
    await expect(card).toContainText("DNP DS-RX1Error");
    await expect(card).toContainText("12 / 700 · menipis");
    await expect(card).toContainText("3 file");
    await expect(card).toContainText("3.2 GB");
    const issues = card.getByTestId("device-issues");
    await expect(issues).toContainText("Kamera tidak terhubung");
    await expect(issues).toContainText("Kertas tinggal 12 lembar");
    await expect(issues).toContainText("2 cetak gagal");
    await expect(issues).toContainText("Upload tersendat: R2 PUT 503");
    await expect(issues).toContainText("Disk tinggal 3.2 GB");
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
