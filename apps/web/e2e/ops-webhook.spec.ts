import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db, hasDb } from "./admin-helpers";

/**
 * Webhook Tetra Ops → Booth: IG klien mengisi event yang belum punya (#215, kontrak v0.7) dan desain kartu QR
 * pilihan klien disimpan ke pengaturan Guest Cam (#225, kontrak v0.9). Tanda tangan HMAC `t=…,v1=…`.
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const sign = (raw: string) => {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", "e2e-ops-webhook-secret").update(`${t}.${raw}`).digest("hex");
  return `t=${t},v1=${v1}`;
};

test("webhook Ops: IG klien & desain kartu QR masuk ke event", async ({ request }) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const project = `PRJ-E2E-WH-${Date.now()}`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "e2e webhook ops",
      mode: "event",
      event_date: "2026-12-12",
      ops_project_id: project,
      settings: { guestCam: { enabled: true, shots: 10 } },
    })
    .select("id")
    .single();
  try {
    const send = async (booking: Record<string, unknown>) => {
      const raw = JSON.stringify({
        event: "booking.updated",
        delivery_id: randomUUID(),
        occurred_at: new Date().toISOString(),
        booking: { project_id: project, ...booking },
      });
      return request.post("/api/webhooks/tetra-ops", {
        headers: { "content-type": "application/json", "x-tetra-signature": sign(raw) },
        data: raw,
      });
    };
    expect((await request.post("/api/webhooks/tetra-ops", { data: "{}" })).status()).toBe(401);
    expect(
      (
        await send({ client_instagram: ["@Rina.Dimas", "wo.bahagia"], guest_card_design: "butter" })
      ).status(),
    ).toBe(200);
    const row = async () =>
      (
        await db
          .from("events")
          .select("client_instagram, settings")
          .eq("id", ev?.id ?? "")
          .single()
      ).data;
    const a = await row();
    expect(a?.client_instagram).toEqual(["rina.dimas", "wo.bahagia"]);
    expect(a?.settings).toMatchObject({
      guestCam: { enabled: true, shots: 10, cardDesign: "butter" },
    });
    // Paket Guest Cam (#226): tier 200 + add-on cetak; lalu naik tier → batas ikut berubah.
    await send({
      modules: ["photobooth", "guest_cam"],
      guest_cam_max_guests: 200,
      guest_cam_print: true,
    });
    expect((await row())?.settings).toMatchObject({
      guestCam: { enabled: true, maxGuests: 200, print: true, cardDesign: "butter" },
    });
    await send({
      modules: ["photobooth", "guest_cam"],
      guest_cam_max_guests: 500,
      guest_cam_print: true,
    });
    expect((await row())?.settings).toMatchObject({ guestCam: { maxGuests: 500 } });
    // IG yang sudah terisi tidak ditimpa; desain tidak dikenal diabaikan.
    await send({ client_instagram: ["lain"], guest_card_design: "nope" });
    const b = await row();
    expect(b?.client_instagram).toEqual(["rina.dimas", "wo.bahagia"]);
    expect(b?.settings).toMatchObject({ guestCam: { cardDesign: "butter" } });
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
  }
});
