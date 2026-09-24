import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** A6/A7: link klien dari admin → galeri /g/{token} (lightbox, favorit, filter) → cabut link. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("link klien, galeri, favorit, cabut", async ({ page, browser }) => {
  const u = await makeUser("owner");
  const tag = String(Date.now()).slice(-6).replace(/[01]/g, "5");
  const ids: [string, string] = [`gla${tag}a`, `glb${tag}a`];
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e galeri ${tag}`,
      mode: "event",
      event_date: "2026-10-12",
      location: "Gedung Kirana",
      branding: { tagline: "The Wedding of" },
      client_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
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
        started_at: `2026-10-12T1${2 + i}:10:00Z`,
        upload_status: "complete",
      })),
    );
    await db.from("assets").insert(
      ids.flatMap((sid) =>
        (["strip_web_0", "thumb_strip_0", "original_1", "thumb_original_1"] as const).map((f) => ({
          organization_id: u.org,
          session_id: sid,
          kind: f.replace(/_\d$/, ""),
          idx: Number(f.slice(-1)),
          r2_key: `${R2}/${f}.jpg#${sid}`,
        })),
      ),
    );

    await login(page, u);
    await page.goto(`/admin/events/${eventId}/settings`);
    await page.getByTestId("link-client").waitFor();
    await page.getByRole("button", { name: "Buat Link" }).first().click();
    await expect(page.getByTestId("link-client")).toContainText("/g/");
    const url =
      (await page.getByTestId("link-client").locator("span.truncate").textContent()) ?? "";
    const path = new URL(url).pathname;

    const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await guest.goto(path);
    await expect(guest.getByRole("heading", { name: `e2e galeri ${tag}` })).toBeVisible();
    await expect(guest.getByTestId("photo-count")).toHaveText("4 foto");
    await expect(guest.getByTestId("gallery-photo")).toHaveCount(2);
    await guest.screenshot({ path: "test-results/gallery-mobile.png", fullPage: true });
    await guest.getByTestId("gallery-photo").first().click();
    await expect(guest.getByRole("dialog")).toContainText("1 / 2");
    await guest.getByRole("button", { name: "♡ Favorit" }).click();
    await expect(guest.getByRole("button", { name: "♥ Favorit" })).toBeVisible();
    await guest.getByRole("button", { name: "Tutup" }).click();
    await guest.getByRole("button", { name: "♥ Favorit (1)" }).click();
    await expect(guest.getByTestId("gallery-photo")).toHaveCount(1);
    await guest.getByRole("button", { name: "Original" }).click();
    await expect(guest.getByTestId("gallery-photo")).toHaveCount(2);
    expect(
      (await db.from("favorites").select("asset_id").eq("event_id", eventId)).data,
    ).toHaveLength(1);
    await expect(guest.getByRole("link", { name: "↓ Download Semua" })).toBeVisible();
    await guest.getByRole("button", { name: "▶ Putar Slideshow" }).click();
    await expect(guest.getByRole("dialog")).toContainText("1 / 2");
    await expect(guest.getByRole("dialog")).toContainText("2 / 2", { timeout: 6000 });
    await guest.getByRole("button", { name: "Tutup" }).click();
    const zip = await guest.request.get(`/api/g/${path.split("/").pop()}/zip?kind=original`);
    expect(zip.headers()["content-type"]).toBe("application/zip");
    const bytes = await zip.body();
    expect(bytes.subarray(0, 2).toString()).toBe("PK");
    expect(bytes.length).toBeGreaterThan(2000);

    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Cabut", exact: true }).first().click();
    await expect(page.getByTestId("link-client")).toContainText("Belum ada link");
    await guest.goto(path);
    await expect(guest.getByRole("heading", { name: "Galeri tidak tersedia" })).toBeVisible();
    await guest.close();
  } finally {
    await db.from("audit_logs").delete().eq("target", eventId);
    await db.from("events").delete().eq("id", eventId);
    await u.cleanup();
  }
});
