import { expect, test } from "@playwright/test";
import { createEventViaWizard, db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * Guest Cam sisi admin (#203, desain E14/E15/D13): owner menyalakan Guest Cam + moderasi manual di Pengaturan,
 * membuat link; tamu mengunggah lewat API; foto masuk antrean "Perlu disetujui", disetujui, lalu tampil di tab
 * Guest Cam galeri klien. Screenshot ke GC_SHOTS kalau diisi (pembanding desain).
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

test("admin: setelan Guest Cam → tamu unggah → setujui → galeri klien", async ({
  page,
  request,
}) => {
  test.setTimeout(180_000);
  const shot = (n: string, full = false) =>
    process.env.GC_SHOTS
      ? page.screenshot({ path: `${process.env.GC_SHOTS}/${n}.png`, fullPage: full })
      : null;
  const u = await makeUser("owner");
  const name = `e2e guest admin ${Date.now()}`;
  let eventId = "";
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, u);
    const slug = await createEventViaWizard(page, {
      name,
      date: "2026-12-20",
      paper: /Strip 2R/,
      design: "auto",
    });
    await page.goto(`/admin/events/${slug}/settings#guest-cam`);
    await page.getByText("Nyalakan Guest Cam").click();
    await page.getByLabel("Jatah foto per HP").fill("3");
    await page.getByText("Perlu disetujui", { exact: true }).click();
    await page.getByText("Langsung", { exact: true }).click();
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByText("Tidak ada perubahan")).toBeVisible({ timeout: 30_000 });
    await page.locator("#guest-cam").getByRole("button", { name: "Buat Link" }).click();
    await expect(page.getByTestId("link-guest")).toContainText("/c/");
    if (process.env.GC_SHOTS) {
      const card = await page.context().newPage();
      await card.goto(`/admin/events/${slug}/guest-card`);
      await card.getByTestId("table-card").screenshot({ path: `${process.env.GC_SHOTS}/B11a.png` });
      await card.close();
    }
    await page.locator("#guest-cam").scrollIntoViewIfNeeded();
    await shot("E14");
    const { data: ev } = await db
      .from("events")
      .select("id, settings, guest_token")
      .eq("slug", slug)
      .single();
    eventId = ev?.id ?? "";
    expect((ev?.settings as { guestCam?: unknown } | null)?.guestCam).toMatchObject({
      enabled: true,
      shots: 3,
      reveal: "live",
      approval: "manual",
    });

    // Tamu (konteks request terpisah = cookie sendiri).
    const base = `/api/c/${ev?.guest_token}`;
    const ip = { "x-forwarded-for": `e2e-gca-${Date.now()}` };
    expect(
      (
        await request.post(`${base}/join`, {
          headers: ip,
          data: { name: "Sari", instagram: "@sari", consent: true },
        })
      ).ok(),
    ).toBe(true);
    for (const idx of [0, 1]) {
      const sign = await request.post(`${base}/sign`, {
        headers: ip,
        data: { kind: "photo", idx },
      });
      for (const up of (await sign.json()).uploads)
        await request.put(up.url, { headers: { "Content-Type": up.contentType }, data: JPEG });
      expect(
        (await request.post(`${base}/done`, { headers: ip, data: { kind: "photo", idx } })).ok(),
      ).toBe(true);
    }

    await page.goto(`/admin/events/${slug}`);
    const grid = page.getByRole("heading", { name: "Perlu disetujui" }).locator("../..");
    await expect(grid.getByRole("listitem")).toHaveCount(2);
    await page.locator("#guest-cam").scrollIntoViewIfNeeded();
    await shot("E15");
    await grid.getByRole("button", { name: "Setujui" }).first().click();
    await expect(grid.getByRole("listitem")).toHaveCount(1);
    await page.keyboard.press("x");
    await expect(page.getByText("Antrean kosong")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await db
              .from("assets")
              .select("review_status, sessions!inner(event_id)")
              .eq("sessions.event_id", eventId)
              .in("kind", ["original", "thumb_original"])
          ).data
            ?.map((r) => r.review_status)
            .sort(),
        { timeout: 20_000 },
      )
      .toEqual([null, null, "rejected", "rejected"]);

    // Galeri klien: tab Snapbook (#228) berisi 1 foto (yang disetujui), per tamu.
    await page.goto(`/admin/events/${slug}/settings#link-klien`);
    await page.locator("#link-klien").getByRole("button", { name: "Buat Link" }).first().click();
    await expect(page.getByTestId("link-client")).toContainText("/g/");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${slug}`);
    await page.getByRole("button", { name: /^Snapbook/ }).click();
    await expect(page.getByText("1 tamu")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sari" })).toBeVisible();
    await expect(page.getByTestId("gallery-photo")).toHaveCount(1);
    await shot("D13a", true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
  } finally {
    if (eventId) await db.from("events").delete().eq("id", eventId);
    await u.cleanup();
  }
});
