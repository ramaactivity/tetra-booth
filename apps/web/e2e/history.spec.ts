import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Riwayat perubahan (audit 27 Nov): kalimat awam + nama orang & event, owner/admin saja. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("riwayat: siapa mengubah apa di event mana; crew tidak melihat menunya", async ({
  page,
  browser,
}) => {
  const u = await makeUser("owner");
  const crew = await makeUser("crew");
  const name = `e2e riwayat ${Date.now()}`;
  const { data: ev } = await db
    .from("events")
    .insert({ organization_id: u.org, name, mode: "event", event_date: "2026-11-21" })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  try {
    await db.from("audit_logs").insert([
      { organization_id: u.org, actor_user_id: u.id, action: "link.client.new", target: eventId },
      {
        organization_id: u.org,
        actor_user_id: u.id,
        action: "event.quick.approval",
        target: eventId,
        meta: { value: "manual" },
      },
    ]);
    await login(page, u);
    await page.getByRole("link", { name: "Riwayat", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Riwayat", level: 1 })).toBeVisible();
    const rows = page.getByTestId("history-row").filter({ hasText: name });
    await expect(rows).toHaveCount(2);
    const who = u.email.split("@")[0] ?? "";
    await expect(rows.filter({ hasText: "persetujuan" })).toContainText(
      `${who} mengubah persetujuan foto Guest Cam jadi Manual (Akses cepat) · ${name}`,
    );
    await expect(rows.filter({ hasText: "link galeri" })).toContainText(
      `${who} membuat link galeri klien · ${name}`,
    );
    await page.screenshot({ path: "test-results/history.png", fullPage: true });

    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await login(other, crew);
    await expect(other.getByRole("link", { name: "Riwayat", exact: true })).toHaveCount(0);
    await other.goto("/admin/riwayat");
    await expect(other.getByRole("heading", { name: "Riwayat", level: 1 })).toHaveCount(0);
    await ctx.close();
  } finally {
    await db.from("audit_logs").delete().eq("target", eventId);
    await db.from("events").delete().eq("id", eventId);
    await u.cleanup();
    await crew.cleanup();
  }
});
