import { expect, test } from "@playwright/test";
import { newAccessToken, newSessionId } from "@tetra/shared";
import { db, hasDb } from "./admin-helpers";

/** Fase 5 L2/L3: animasi di galeri klien; klien membuka galeri publik → tamu melihatnya read-only. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 390, height: 844 } });

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("animasi di galeri, toggle galeri publik, tamu melihat read-only", async ({
  page,
  browser,
}) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const device =
    (await db.from("devices").select("id").eq("organization_id", org).limit(1).single()).data?.id ??
    "";
  const token = newAccessToken();
  const ids = [newSessionId(), newSessionId()];
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "e2e galeri publik",
      mode: "event",
      event_date: "2026-10-12",
      client_token: token,
      client_expires_at: "2099-01-01T00:00:00Z",
      guest_expires_at: "2099-01-01T00:00:00Z",
    })
    .select("id")
    .single();
  try {
    await db.from("sessions").insert(
      ids.map((id, i) => ({
        id,
        organization_id: org,
        event_id: ev?.id ?? "",
        device_id: device,
        started_at: `2026-10-12T1${2 + i}:10:00Z`,
        upload_status: "complete",
      })),
    );
    await db.from("assets").insert(
      ids.flatMap((sid) =>
        (["strip_web_0", "thumb_strip_0", "animation_0"] as const).map((f) => ({
          organization_id: org,
          session_id: sid,
          kind: f.replace(/_\d$/, ""),
          idx: 0,
          r2_key: `${R2}/${f}.${f.startsWith("animation") ? "gif" : "jpg"}#${sid}`,
        })),
      ),
    );

    // Tamu: galeri publik masih mati → tanpa link, halaman galeri "tidak tersedia".
    const guestUrl = `/s/${ids[0]}`;
    const guest = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await guest.goto(guestUrl);
    await expect(guest.getByRole("button", { name: "Simpan ke Galeri HP" })).toBeVisible();
    await expect(guest.getByRole("link", { name: /Lihat galeri acara/ })).toHaveCount(0);
    await guest.goto(`${guestUrl}/galeri`);
    await expect(guest.getByRole("heading", { name: "Galeri acara tidak tersedia" })).toBeVisible();

    // Klien: filter Animasi, lalu aktifkan galeri publik dari Pengaturan (C4).
    const version = async () =>
      (
        await db
          .from("events")
          .select("bundle_version")
          .eq("id", ev?.id ?? "")
          .single()
      ).data?.bundle_version ?? 0;
    const before = await version();
    await page.goto(`/g/${token}`);
    await page.getByRole("button", { name: "Animasi" }).click();
    await expect(page.getByTestId("gallery-photo")).toHaveCount(2);
    await page.getByRole("button", { name: "⚙ Pengaturan" }).click();
    await expect(page.getByText("Semua foto akan dihapus pada")).toBeVisible();
    await page.getByText("Galeri publik", { exact: true }).click();
    await expect(page.getByRole("switch")).toBeChecked({ timeout: 20_000 }); // compile pertama route di dev
    await page.screenshot({ path: "test-results/gallery-settings.png" });
    await expect
      .poll(
        async () =>
          (
            await db
              .from("events")
              .select("public_gallery")
              .eq("id", ev?.id ?? "")
              .single()
          ).data?.public_gallery,
      )
      .toBe(true);
    // #199: booth ikut tahu (QR galeri di TV Photo Stage) lewat versi bundle baru.
    expect(await version()).toBe(before + 1);

    await guest.goto(guestUrl);
    await guest.getByRole("link", { name: /Lihat galeri acara/ }).click();
    await expect(guest.getByRole("heading", { name: "e2e galeri publik" })).toBeVisible();
    await expect(guest.getByTestId("gallery-photo")).toHaveCount(2);
    await expect(guest.getByRole("button", { name: /Favorit/ })).toHaveCount(0);
    await expect(guest.getByRole("link", { name: /Download Semua/ })).toHaveCount(0);
    await guest.getByRole("button", { name: "Animasi" }).click();
    await guest.getByTestId("gallery-photo").first().click();
    await expect(guest.getByRole("dialog")).toContainText("1 / 2");
    await expect(guest.getByRole("button", { name: /Favorit/ })).toHaveCount(0);
    await guest.screenshot({ path: "test-results/gallery-public.png" });
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
  }
});
