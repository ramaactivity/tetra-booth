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
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await db.from("rate_limits").delete().eq("key", `pair:e2e-${code}`);
  }
});
