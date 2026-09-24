import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";

/** API booth Fase 2 (N2) terhadap Supabase dev: pairing sekali pakai, heartbeat, token dicabut → 401. */

const envFile = join(__dirname, "../.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
test.skip(!url || !key, "butuh Supabase dev (apps/web/.env.local)");

test("pairing → heartbeat → kode hangus → dicabut 401", async ({ request }) => {
  const db = createClient<Database>(url ?? "", key ?? "", { auth: { persistSession: false } });
  const org = (await db.from("organizations").select("id").eq("slug", "tetra").single()).data;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const { data: dev, error } = await db
    .from("devices")
    .insert({
      organization_id: org?.id ?? "",
      name: "e2e booth-api",
      short_code: `E2E-${code}`,
      pairing_code: code,
      pairing_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  // IP uji unik per run: rate limit pair per IP (10 / 10 menit) tidak terbawa antar-run.
  const ip = { "x-forwarded-for": `e2e-${code}` };
  let eventId = "";
  try {
    expect(
      (await request.post("/api/booth/pair", { headers: ip, data: { code: "12" } })).status(),
    ).toBe(400);

    const pair = await request.post("/api/booth/pair", { headers: ip, data: { code } });
    expect(pair.status()).toBe(200);
    const { token, deviceId } = await pair.json();
    expect(deviceId).toBe(dev?.id);
    const auth = { Authorization: `Bearer ${token}` };

    const again = await request.post("/api/booth/pair", { headers: ip, data: { code } });
    expect(again.status()).toBe(400);
    expect(await again.json()).toEqual({ error: "invalid_code" });

    const hb = await request.post("/api/booth/heartbeat", {
      headers: auth,
      data: { appVersion: "0.0.1-e2e", status: { printer: "ok" } },
    });
    expect(hb.status()).toBe(200);
    const row = (
      await db
        .from("devices")
        .select("app_version, status, last_seen_at")
        .eq("id", deviceId)
        .single()
    ).data;
    expect(row).toMatchObject({ app_version: "0.0.1-e2e", status: { printer: "ok" } });
    expect(row?.last_seen_at).toBeTruthy();

    // N3: event bertanda bundle yang ditugaskan → daftar + manifest; event lain → 404.
    const { data: ev } = await db
      .from("events")
      .insert({
        organization_id: org?.id ?? "",
        name: "e2e event",
        mode: "event",
        event_date: "2026-10-12",
        bundle_version: 2,
        bundle: {
          config: { name: "e2e event" },
          files: [{ file: "overlay.png", sha256: "a".repeat(64), key: "o/e/bundle/aaa.png" }],
        },
      })
      .select("id")
      .single();
    eventId = ev?.id ?? "";
    expect(
      (await (await request.get("/api/booth/events", { headers: auth })).json()).events,
    ).toEqual([]);
    await db
      .from("event_devices")
      .insert({ organization_id: org?.id ?? "", event_id: eventId, device_id: deviceId });
    expect(
      (await (await request.get("/api/booth/events", { headers: auth })).json()).events,
    ).toEqual([{ id: eventId, name: "e2e event", bundleVersion: 2 }]);
    const m = await (
      await request.get(`/api/booth/events/${eventId}/bundle`, { headers: auth })
    ).json();
    expect(m).toMatchObject({ bundleVersion: 2, config: { id: eventId, name: "e2e event" } });
    expect(m.files[0].url).toMatch(/\/o\/e\/bundle\/aaa\.png$/);
    expect(
      (
        await request.get("/api/booth/events/7c9e6679-7425-40de-944b-e07fc1f90ae7/bundle", {
          headers: auth,
        })
      ).status(),
    ).toBe(404);
    expect(
      (await request.get("/api/booth/events/bukan-uuid/bundle", { headers: auth })).status(),
    ).toBe(404);

    expect(
      (await request.post("/api/booth/heartbeat", { data: { appVersion: "x" } })).status(),
    ).toBe(401);
    await db.from("devices").update({ revoked_at: new Date().toISOString() }).eq("id", deviceId);
    const revoked = await request.post("/api/booth/heartbeat", {
      headers: auth,
      data: { appVersion: "x" },
    });
    expect(revoked.status()).toBe(401);

    for (let i = 0; i < 7; i++)
      await request.post("/api/booth/pair", { headers: ip, data: { code } });
    const limited = await request.post("/api/booth/pair", { headers: ip, data: { code } });
    expect(limited.status()).toBe(429);
  } finally {
    if (eventId) await db.from("events").delete().eq("id", eventId);
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await db.from("rate_limits").delete().eq("key", `pair:e2e-${code}`);
  }
});
