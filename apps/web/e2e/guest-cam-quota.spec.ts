import { expect, test } from "@playwright/test";
import { newSessionId } from "@tetra/shared";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * Kuota tamu Guest Cam per tier (#221): maks. 2 tamu → berhenti di 3 (+10%, dibulatkan ke atas). Tamu = sesi dengan
 * ≥ 1 foto; satu nomor WA = satu tamu walau HP lain. Tamu terhitung disiapkan langsung di DB (tanpa unggah R2).
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("kuota tamu: tamu baru ditolak setelah batas +10%, nomor yang sudah terhitung tetap boleh", async ({
  playwright,
  baseURL,
  page,
}) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const token = `e2e-gcq-${Date.now()}`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "e2e guest cam kuota",
      mode: "event",
      event_date: "2026-12-31",
      guest_token: token,
      settings: { guestCam: { enabled: true, shots: 3, maxGuests: 2 } },
    })
    .select("id, slug")
    .single();
  const eventId = ev?.id ?? "";
  const counted = ["6281100000001", "6281100000002", "6281100000003"];
  const base = `/api/c/${token}`;
  // Tiap "HP" = konteks dengan cookie sendiri.
  const phone = (n: number) =>
    playwright.request.newContext({
      baseURL: baseURL ?? "http://localhost:3000",
      extraHTTPHeaders: { "x-forwarded-for": `${token}-${n}` },
    });
  try {
    for (const wa of counted) {
      const id = newSessionId();
      await db.from("sessions").insert({
        id,
        organization_id: org,
        event_id: eventId,
        source: "guest",
        group_name: wa,
        guest_key_hash: `e2e-${id}`,
        asset_count: 1,
        started_at: new Date().toISOString(),
      });
      await db.from("leads").insert({
        organization_id: org,
        event_id: eventId,
        session_id: id,
        data: { name: wa, whatsapp: wa, source: "guest_cam" },
        consent_version: "e2e",
        consent_at: new Date().toISOString(),
      });
    }
    const join = (ctx: Awaited<ReturnType<typeof phone>>, whatsapp: string) =>
      ctx.post(`${base}/join`, { data: { name: "Tamu", whatsapp, consent: true } });

    // 3 tamu terhitung = batas 2 + 10% → tamu baru ditolak.
    const d = await phone(1);
    const full = await join(d, "081100000004");
    expect(full.status()).toBe(403);
    expect(await full.json()).toEqual({ error: "guest_full" });

    // Nomor yang sudah terhitung dari HP lain → boleh, dan foto pertamanya boleh.
    const a2 = await phone(2);
    expect((await join(a2, "081100000001")).status()).toBe(200);
    expect((await a2.post(`${base}/sign`, { data: { kind: "photo", idx: 0 } })).status()).toBe(200);

    // Satu tamu terhitung hilang → masih ada ruang: tamu baru boleh bergabung & memotret.
    await db
      .from("sessions")
      .update({ asset_count: 0 })
      .eq("group_name", counted[2] ?? "")
      .eq("event_id", eventId);
    expect((await join(d, "081100000004")).status()).toBe(200);
    expect((await d.post(`${base}/sign`, { data: { kind: "photo", idx: 0 } })).status()).toBe(200);

    // Admin melihat pemakaian kuota (2 terhitung dari batas 2 → hampir penuh).
    const admin = await makeUser("admin");
    try {
      await page.setViewportSize({ width: 1280, height: 900 });
      await login(page, admin);
      await page.goto(`/admin/events/${ev?.slug}`);
      await expect(page.locator("#guest-cam")).toContainText("Kuota tamu");
      await expect(page.locator("#guest-cam")).toContainText("dari 2 · hampir penuh");
    } finally {
      await admin.cleanup();
    }

    // Tanpa batas (tak terbatas) → selalu boleh.
    await db
      .from("events")
      .update({ settings: { guestCam: { enabled: true, shots: 3, maxGuests: null } } })
      .eq("id", eventId);
    const e = await phone(3);
    expect((await join(e, "081100000005")).status()).toBe(200);
    await Promise.all([d, a2, e].map((c) => c.dispose()));
  } finally {
    await db.from("events").delete().eq("id", eventId);
  }
});
