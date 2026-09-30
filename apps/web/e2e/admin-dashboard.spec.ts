import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** A5: dashboard event (statistik, funnel) + moderasi sembunyikan/hapus + audit log. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("statistik, sembunyikan, hapus, audit", async ({ page }) => {
  const u = await makeUser("owner");
  const tag = String(Date.now()).slice(-6).replace(/[01]/g, "7");
  const ids: [string, string, string] = [`dsa${tag}a`, `dsb${tag}a`, `dsc${tag}a`];
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e dash ${tag}`,
      mode: "event",
      event_date: "2026-10-12",
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  const device =
    (await db.from("devices").select("id").eq("organization_id", u.org).limit(1).single()).data
      ?.id ?? "";
  try {
    await db.from("sessions").insert(
      ids.map((id, i) => ({
        id,
        organization_id: u.org,
        event_id: eventId,
        device_id: device,
        started_at: `2026-10-12T1${3 + i}:00:00Z`,
        print_count: 2,
        upload_status: "complete",
      })),
    );
    await db.from("assets").insert([
      {
        organization_id: u.org,
        session_id: ids[0],
        kind: "thumb_strip",
        idx: 0,
        r2_key: `${R2}/thumb_strip_0.jpg#${ids[0]}`,
      },
      {
        organization_id: u.org,
        session_id: ids[2],
        kind: "strip",
        idx: 0,
        r2_key: `e2e/tidak-ada/${ids[2]}.jpg`,
      },
    ]);
    await db.from("analytics_events").insert([
      { organization_id: u.org, event_id: eventId, session_id: ids[0], type: "qr_open" },
      { organization_id: u.org, event_id: eventId, session_id: ids[0], type: "save" },
    ]);

    await login(page, u);
    await page.goto(`/admin/events/${eventId}`);
    await expect(page.getByTestId("stat-Total sesi")).toHaveText(/^3/);
    await expect(page.getByTestId("stat-Lembar dicetak")).toHaveText(/^6/);
    await expect(page.getByTestId("stat-QR dibuka")).toHaveText("1 33%");
    await page.screenshot({ path: "test-results/admin-dashboard.png", fullPage: true });

    const tile = (id: string) => page.getByTestId("session-tile").filter({ hasText: id });
    // Link untuk dibagikan langsung di ringkasan event; Bagikan per sesi menyalin link halaman tamu.
    await expect(page.getByRole("region", { name: "Link untuk dibagikan" })).toBeVisible();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await tile(ids[0])
      .getByRole("button", { name: `Bagikan link sesi ${ids[0]}` })
      .click();
    await expect(tile(ids[0])).toContainText("Link tersalin");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(
      new RegExp(`/s/${ids[0]}$`),
    );
    await tile(ids[1]).getByRole("button", { name: "Sembunyikan" }).click();
    await expect(tile(ids[1])).toContainText("Disembunyikan");
    page.once("dialog", (d) => d.accept());
    await tile(ids[2]).getByRole("button", { name: "Hapus" }).click();
    await expect(tile(ids[2])).toHaveCount(0);
    await expect(page.getByTestId("stat-Total sesi")).toHaveText(/^2/);

    const guest = await page.request.get(`/s/${ids[1]}`);
    expect(await guest.text()).toContain("dihapus oleh penyelenggara");
    const audit =
      (await db.from("audit_logs").select("action, target").in("target", ids)).data ?? [];
    expect(audit.map((a) => a.action).sort()).toEqual(["session.delete", "session.hide"]);
    expect((await db.from("assets").select("id").eq("session_id", ids[2])).data).toEqual([]);
  } finally {
    await db.from("audit_logs").delete().in("target", ids);
    await db.from("events").delete().eq("id", eventId);
    await u.cleanup();
  }
});
