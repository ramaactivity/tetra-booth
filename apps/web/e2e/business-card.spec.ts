import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Kartu QR Snapbook (#227/#228): katalog publik 5 desain + cetak kartu meja A6/A5 & kartu nama dua sisi di admin. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const IDS = ["sekali-pakai", "polaroid", "film", "elegan", "poster"];

test("katalog 5 desain + cetak kartu meja & kartu nama per desain", async ({ page, request }) => {
  test.setTimeout(120_000);
  const cat = await (await request.get("/api/guest-cards")).json();
  expect(cat.designs.map((d: { id: string }) => d.id)).toEqual(IDS);
  const thumb = await request.get("/api/guest-cards/film?side=card");
  expect(thumb.headers()["content-type"]).toContain("image/svg+xml");
  expect(await thumb.text()).toContain("Rina &amp; Dimas");
  expect((await request.get("/api/guest-cards/nope")).status()).toBe(404);

  const admin = await makeUser("admin");
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: admin.org,
      name: "e2e Wedding Adel & Alpi",
      mode: "event",
      event_date: "2026-10-10",
      guest_token: `e2e-bc-${Date.now()}`,
      // Id lama v0.9 (butter) dipetakan ke desain baru (Retro Cam).
      settings: { guestCam: { enabled: true, shots: 15, cardDesign: "butter" } },
    })
    .select("id, slug")
    .single();
  try {
    await page.setViewportSize({ width: 1280, height: 1000 });
    await login(page, admin);
    await page.goto(`/admin/events/${ev?.slug}/guest-card`);
    await expect(page.getByRole("link", { name: "Retro Cam" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    for (const id of IDS) {
      await page.goto(`/admin/events/${ev?.slug}/guest-card?d=${id}&size=a6`);
      const card = page.getByTestId("table-card");
      await expect(card.locator("svg")).toHaveAttribute("width", "105mm");
      await expect(card).toContainText("Adel");
      await card.screenshot({ path: `test-results/card-a6-${id}.png` });
      await page.goto(`/admin/events/${ev?.slug}/business-card?d=${id}`);
      await expect(page.getByTestId("business-card").locator("svg")).toHaveAttribute(
        "width",
        "96mm",
      );
      await page
        .getByTestId("business-card")
        .screenshot({ path: `test-results/card-front-${id}.png` });
      await page
        .getByTestId("business-card-back")
        .screenshot({ path: `test-results/card-back-${id}.png` });
    }
    await page.goto(`/admin/events/${ev?.slug}/guest-card?d=poster&size=a5`);
    await expect(page.getByTestId("table-card").locator("svg")).toHaveAttribute("width", "148mm");
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
    await admin.cleanup();
  }
});
