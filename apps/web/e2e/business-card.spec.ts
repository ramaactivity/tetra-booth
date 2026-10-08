import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Kartu QR Guest Cam ukuran kartu nama (#225): katalog publik untuk portal Ops + halaman cetak admin. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("katalog kartu QR publik + cetak kartu nama di admin dengan desain pilihan", async ({
  page,
  request,
}) => {
  const cat = await (await request.get("/api/guest-cards")).json();
  expect(cat.size_mm).toEqual({ width: 90, height: 55, bleed: 3 });
  expect(cat.designs.map((d: { id: string }) => d.id)).toEqual([
    "klasik",
    "mint",
    "butter",
    "gelap",
  ]);
  const thumb = await request.get("/api/guest-cards/mint");
  expect(thumb.headers()["content-type"]).toContain("image/svg+xml");
  const svg = await thumb.text();
  expect(svg).toContain("Rina &amp; Dimas");
  expect(svg).toContain('width="90mm"');
  expect((await request.get("/api/guest-cards/nope")).status()).toBe(404);

  const admin = await makeUser("admin");
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: admin.org,
      name: "e2e kartu nama Ayu & Bima",
      mode: "event",
      event_date: "2026-12-12",
      guest_token: `e2e-bc-${Date.now()}`,
      branding: { tagline: "The Wedding of" },
      settings: { guestCam: { enabled: true, shots: 12, cardDesign: "gelap" } },
    })
    .select("id, slug")
    .single();
  try {
    await page.setViewportSize({ width: 1280, height: 900 });
    await login(page, admin);
    await page.goto(`/admin/events/${ev?.slug}/business-card`);
    const card = page.getByTestId("business-card");
    await expect(card.locator("svg")).toHaveAttribute("width", "96mm");
    await expect(card).toContainText("Ayu & Bima");
    await expect(card).toContainText("12.12.2026");
    await expect(card).toContainText("jepret 12 foto");
    // Desain pilihan event (gelap) = latar tinta.
    await expect(card.locator("svg > rect").first()).toHaveAttribute("fill", "#1D1D1B");
    await page.screenshot({ path: "test-results/business-card-gelap.png" });
    await page.getByRole("link", { name: "Mint" }).click();
    await expect(page).toHaveURL(/\?d=mint$/);
    await expect(card.locator("svg > rect").first()).toHaveAttribute("fill", "#D6F1EA");
    await page.screenshot({ path: "test-results/business-card-mint.png" });
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
    await admin.cleanup();
  }
});
