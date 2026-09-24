import { expect, test } from "@playwright/test";
import { db, hasDb } from "./admin-helpers";

/** A9: cron retensi menandai event lewat purge_at sebagai purged dan menghapus baris aset. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("purge event kedaluwarsa", async ({ request }) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const device =
    (await db.from("devices").select("id").eq("organization_id", org).limit(1).single()).data?.id ??
    "";
  const sid = `prg${String(Date.now()).slice(-6).replace(/[01]/g, "9")}a`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "e2e purge",
      mode: "event",
      event_date: "2026-01-01",
      purge_at: "2026-02-01T00:00:00Z",
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  try {
    await db.from("sessions").insert({
      id: sid,
      organization_id: org,
      event_id: eventId,
      device_id: device,
      started_at: "2026-01-01T10:00:00Z",
    });
    await db.from("assets").insert({
      organization_id: org,
      session_id: sid,
      kind: "strip",
      idx: 0,
      r2_key: `${org}/${eventId}/sessions/${sid}/strip_0.jpg`,
    });
    const r = await request.get("/api/cron/purge");
    expect(r.status()).toBe(200);
    expect((await r.json()).purged).toContain(eventId);
    expect(
      (await db.from("events").select("purged_at").eq("id", eventId).single()).data?.purged_at,
    ).toBeTruthy();
    expect((await db.from("assets").select("id").eq("session_id", sid)).data).toEqual([]);
  } finally {
    await db.from("events").delete().eq("id", eventId);
  }
});
