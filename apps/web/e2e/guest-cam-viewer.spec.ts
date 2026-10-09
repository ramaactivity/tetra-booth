import { expect, test } from "@playwright/test";
import { db, hasDb } from "./admin-helpers";

/** Album Guest Cam (revisi 9 Okt): foto diketuk → preview besar, geser/pindah kiri-kanan, Esc menutup. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 390, height: 844 } });

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("album Guest Cam: preview besar dengan pindah kiri-kanan", async ({ page }) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const token = `e2e-gcv-${Date.now()}`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "e2e guest cam viewer",
      mode: "event",
      event_date: "2026-12-31",
      guest_token: token,
      settings: { guestCam: { enabled: true, shots: 5, reveal: "live" } },
    })
    .select("id")
    .single();
  try {
    const join = await page.request.post(`/api/c/${token}/join`, {
      headers: { "x-forwarded-for": token },
      data: { name: "Sari", whatsapp: "081234500001", consent: true },
    });
    const { sessionId } = await join.json();
    await db.from("assets").insert(
      [0, 1, 2].flatMap((idx) =>
        (["original", "thumb_original"] as const).map((kind) => ({
          organization_id: org,
          session_id: sessionId,
          kind,
          idx,
          r2_key: `${R2}/original_1.jpg#${sessionId}-${kind}-${idx}`,
        })),
      ),
    );
    await page.goto(`/c/${token}`);
    await page.locator("button", { hasText: /album/i }).first().click();
    const shots = page.getByRole("button", { name: "Lihat foto" });
    await expect(shots).toHaveCount(3);
    await shots.nth(0).click();
    const viewer = page.getByRole("dialog");
    await expect(viewer.getByText("1 / 3")).toBeVisible();
    await viewer.getByRole("button", { name: "Foto berikutnya" }).click();
    await expect(viewer.getByText("2 / 3")).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText("3 / 3")).toBeVisible();
    await expect(viewer.getByRole("button", { name: "Save ke HP" })).toBeVisible();
    await expect(viewer.getByRole("img", { name: "Foto 3 dari 3" })).toHaveJSProperty(
      "complete",
      true,
    );
    await page.screenshot({ path: "test-results/guest-cam-viewer.png", animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(viewer).toBeHidden();
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
  }
});

test("layar pertama Guest Cam: penjelasan 'Snapbook itu apa?' lalu langsung ke form", async ({
  page,
}) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const token = `e2e-gcw-${Date.now()}`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "e2e Adel & Alpi",
      mode: "event",
      event_date: "2026-12-31",
      guest_token: token,
      settings: {
        guestCam: { enabled: true, shots: 15, reveal: "live", voice: true, strip: true },
      },
    })
    .select("id")
    .single();
  try {
    await page.goto(`/c/${token}`);
    await page.getByRole("button", { name: "Snapbook itu apa?" }).click();
    const sheet = page.getByRole("dialog", { name: "Snapbook itu apa?" });
    await expect(sheet).toContainText("Buku tamu, versi HP");
    await expect(sheet).toContainText("Jepret sampai 15 foto, titip voice note, bikin frame lucu");
    await expect(sheet).toContainText("Fotomu langsung muncul di album");
    await page.waitForTimeout(400);
    await page.screenshot({ path: "test-results/guest-cam-what.png" });
    await sheet.getByRole("button", { name: "Oke, isi Snapbook" }).click();
    await expect(page.getByText("Kenalan dulu, yuk")).toBeVisible();
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
  }
});
