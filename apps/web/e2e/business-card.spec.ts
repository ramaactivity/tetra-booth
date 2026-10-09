import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Kartu QR Snapbook (#230): katalog publik 10 konsep + cetak kartu meja A5/A6 & kartu nama dua sisi di admin. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const IDS = [
  "zamrud",
  "renda",
  "pita",
  "teater",
  "koran",
  "majalah",
  "musik",
  "kartupos",
  "kamera",
  "tiket",
];
const SHOTS = process.env.CARD_SHOTS ?? "test-results";

test("katalog 10 konsep + cetak kartu meja & kartu nama per konsep", async ({ page, request }) => {
  test.setTimeout(180_000);
  const cat = await (await request.get("/api/guest-cards")).json();
  expect(cat.designs.map((d: { id: string }) => d.id)).toEqual(IDS);
  expect((await request.get(cat.designs[0].card_back_preview_url)).ok()).toBe(true);
  // Thumbnail lama tetap jalan: id lama dipetakan, diarahkan ke gambar preview.
  const old = await request.get("/api/guest-cards/butter?side=card", { maxRedirects: 0 });
  expect(old.headers().location).toMatch(/\/snapbook\/cards\/kamera-front\.jpg$/);

  const admin = await makeUser("admin");
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: admin.org,
      name: "Wedding Rafi & Dinda",
      mode: "event",
      event_date: "2026-10-10",
      guest_token: `e2e-bc-${Date.now()}`,
      // Id lama #227 (sekali-pakai) dipetakan ke konsep baru (Kamera Sekali Pakai).
      settings: { guestCam: { enabled: true, shots: 15, cardDesign: "sekali-pakai" } },
    })
    .select("id, slug")
    .single();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, admin);
    await page.goto(`/admin/events/${ev?.slug}/guest-card`);
    await expect(page.getByRole("link", { name: /^Kamera Sekali Pakai/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    for (const id of IDS) {
      await page.goto(`/admin/events/${ev?.slug}/guest-card?d=${id}`);
      const card = page.getByTestId("table-card");
      await expect(card).toContainText("Rafi");
      await expect(card.locator("img#qr")).toHaveAttribute("src", /^data:image\/svg\+xml/);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await card.screenshot({ path: `${SHOTS}/card-a5-${id}.png` });
      await page.goto(`/admin/events/${ev?.slug}/business-card?d=${id}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      await page.getByTestId("business-card").screenshot({ path: `${SHOTS}/card-front-${id}.png` });
      await page
        .getByTestId("business-card-back")
        .screenshot({ path: `${SHOTS}/card-back-${id}.png` });
    }
    // Studio: pratinjau muat utuh di layar 1440×900, panel kanan; Unduh PDF langsung (tanpa dialog cetak).
    await page.goto(`/admin/events/${ev?.slug}/guest-card?d=teater&size=a5`);
    await page.waitForTimeout(800);
    const box = await page.getByTestId("table-card").boundingBox();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(900);
    await page.screenshot({ path: `${SHOTS}/studio-meja.png` });
    const [pdf] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Unduh PDF" }).click(),
    ]);
    expect(pdf.suggestedFilename()).toBe("kartu-qr-meja-teater-a5.pdf");
    await pdf.saveAs(`${SHOTS}/meja-teater-a5.pdf`);
    await page.goto(`/admin/events/${ev?.slug}/business-card?d=kamera`);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/studio-nama.png` });
    const [pdf2] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Unduh PDF" }).click(),
    ]);
    await pdf2.saveAs(`${SHOTS}/nama-kamera.pdf`);
    // A6 = skala A5 saat dicetak lewat browser.
    await page.goto(`/admin/events/${ev?.slug}/guest-card?d=koran&size=a6`);
    await page.emulateMedia({ media: "print" });
    await expect(page.getByTestId("table-card")).toHaveCSS("zoom", /0\.70/);
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
    await admin.cleanup();
  }
});
