import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * Tetra Assistant (#264): acara hari ini → laptop yang menjalankannya (heartbeat `activeEvent`) dengan masalah
 * (kertas menipis, cetak gagal) dan angka hari ini; crew bisa membuka, layar HP 390 px.
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 390, height: 844 } });

test("assistant: acara hari ini, laptop + masalahnya, bisa dibuka crew", async ({ page }) => {
  test.setTimeout(90_000);
  const u = await makeUser("crew");
  const tag = String(Date.now()).slice(-6);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e Assistant ${tag}`,
      mode: "event",
      event_date: today,
      ops_project_id: `PRJ-E2E-AS-${tag}`,
    })
    .select("id")
    .single();
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: u.org,
      name: `e2e laptop ${tag}`,
      short_code: `E2E-A${tag}`,
      last_seen_at: new Date().toISOString(),
      status: {
        activeEvent: ev?.id,
        activeEventName: `e2e Assistant ${tag}`,
        paper: { capacity: 700, remaining: 20 },
        failedPrints: 2,
        uploadPending: 0,
        camera: { kind: "canon", model: "Canon EOS 60D", connected: true },
        printer: { name: "DS-RX1", status: "ready", message: null },
      },
    })
    .select("id")
    .single();
  try {
    await login(page, u);
    await page.goto("/admin/assistant");
    const card = page.getByTestId("assistant-event").filter({ hasText: `e2e Assistant ${tag}` });
    await expect(card).toBeVisible();
    const laptop = card.getByTestId("assistant-device");
    await expect(laptop).toContainText(`e2e laptop ${tag}`);
    await expect(laptop).toContainText("Online");
    await expect(laptop).toContainText("Kertas tinggal 20 lembar");
    await expect(laptop).toContainText("2 cetak gagal");
    await expect(laptop).toContainText("Canon EOS 60D");
    await page.screenshot({ path: "test-results/assistant.png", fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    expect(overflow).toBe(false);

    // Digabung ke halaman crew Tetra Ops: status laptop yang sama lewat GET /api/ops/events/{project}.
    const res = await page.request.get(`/api/ops/events/PRJ-E2E-AS-${tag}`, {
      headers: {
        authorization: "Bearer e2e-ops-api-token" /* = playwright.config webServer env */,
      },
    });
    expect(res.status()).toBe(200);
    const [opsEv] = (await res.json()).events;
    expect(opsEv.unit).toBe(1);
    expect(opsEv.booths).toHaveLength(1);
    expect(opsEv.booths[0]).toMatchObject({
      name: `e2e laptop ${tag}`,
      online: true,
      failed_prints: 2,
      paper: { remaining: 20, capacity: 700 },
      camera: { model: "Canon EOS 60D", connected: true },
    });
    expect(opsEv.booths[0].issues).toContain("Kertas tinggal 20 lembar");
  } finally {
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
    await u.cleanup();
  }
});
