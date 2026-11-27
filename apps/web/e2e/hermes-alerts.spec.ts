import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db, hasDb } from "./admin-helpers";

/** Alert booth → WA owner lewat Hermes (kontrak 27 Nov): GET alert yang masih relevan, ack idempoten. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const HERMES = { authorization: "Bearer e2e-hermes-token-0123456789abcdef0123" };

test("kertas menipis saat acara jalan → alert, ack → tidak dikirim lagi", async ({ request }) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const tag = Date.now();
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: `e2e alert ${tag}`,
      mode: "event",
      event_date: new Date().toISOString().slice(0, 10),
      run: { segments: [{ start: new Date(Date.now() - 3600_000).toISOString() }] },
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: org,
      name: `e2e alert ${tag}`,
      short_code: "B99",
      token_hash: randomBytes(32).toString("hex"),
      last_seen_at: new Date().toISOString(),
      status: { activeEvent: eventId, paper: { remaining: 12, capacity: 700 } },
    })
    .select("id")
    .single();
  const id = `paper_low:${dev?.id}:${eventId}`;
  try {
    expect((await request.get("/api/hermes/alerts")).status()).toBe(401);
    const list = async () =>
      (
        (await (await request.get("/api/hermes/alerts", { headers: HERMES })).json()) as {
          alerts: { id: string; kind: string; text: string; eventName?: string; booth?: string }[];
        }
      ).alerts.filter((a) => a.id === id);
    const [a] = await list();
    expect(a).toMatchObject({ kind: "paper_low", eventName: `e2e alert ${tag}` });
    expect(a?.text).toContain("tinggal 12 lembar");
    for (let i = 0; i < 2; i++) {
      const ack = await request.post("/api/hermes/alerts/ack", {
        headers: HERMES,
        data: { ids: [id] },
      });
      expect(ack.status()).toBe(200); // kedua kalinya tetap 200 (idempoten)
    }
    expect(await list()).toEqual([]);
  } finally {
    await db.from("alert_acks").delete().eq("id", id);
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await db.from("events").delete().eq("id", eventId);
  }
});
