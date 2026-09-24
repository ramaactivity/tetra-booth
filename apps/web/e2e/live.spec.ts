import { expect, test } from "@playwright/test";
import { newAccessToken } from "@tetra/shared";
import { db, hasDb } from "./admin-helpers";

/** A8: live slideshow menampilkan strip, sesi baru muncul sendiri dengan label "Baru!". */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 1280, height: 720 } });

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("slideshow + sesi baru", async ({ page }) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const device =
    (await db.from("devices").select("id").eq("organization_id", org).limit(1).single()).data?.id ??
    "";
  const token = newAccessToken();
  const tag = String(Date.now()).slice(-6).replace(/[01]/g, "8");
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "Andi & Sari",
      mode: "event",
      event_date: "2026-10-12",
      live_token: token,
      branding: { tagline: "The Wedding of" },
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  const add = async (id: string, at: string) => {
    await db.from("sessions").insert({
      id,
      organization_id: org,
      event_id: eventId,
      device_id: device,
      started_at: at,
      upload_status: "complete",
    });
    await db.from("assets").insert({
      organization_id: org,
      session_id: id,
      kind: "strip_web",
      idx: 0,
      r2_key: `${R2}/strip_web_0.jpg#${id}`,
    });
  };
  try {
    await add(`lva${tag}a`, "2026-09-01T12:00:00Z");
    await page.goto(`/live/${token}`);
    await expect(page.getByRole("heading", { name: "Andi & Sari" })).toBeVisible();
    await expect(page.getByTestId("live-main")).toBeVisible();
    await expect(page.getByText("Baru!")).toHaveCount(0);
    await add(`lvb${tag}a`, new Date().toISOString());
    await expect(page.getByText("Baru!")).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/live.png" });
  } finally {
    await db.from("events").delete().eq("id", eventId);
  }
});
