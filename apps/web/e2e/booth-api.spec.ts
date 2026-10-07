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
      data: {
        appVersion: "0.0.1-e2e",
        status: { printer: { name: null, status: "ready", message: null }, junk: 1 },
      },
    });
    expect(hb.status()).toBe(200);

    // Update aplikasi (DECISIONS #80): rilis terbaru + URL R2 bertanda tangan, bukan *.r2.dev.
    expect((await request.get("/api/booth/update")).status()).toBe(401);
    const upd = await request.get("/api/booth/update", { headers: auth });
    expect(upd.status()).toBe(200);
    const rel = await upd.json();
    expect(rel.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(rel.url).toContain(".r2.cloudflarestorage.com/");
    const dl = await request.get("/download/booth", { maxRedirects: 0 });
    expect(dl.status()).toBe(302);
    expect(dl.headers().location).toContain(rel.key);
    const old = await request.get("/download/booth?v=0.5.3", { maxRedirects: 0 });
    expect(old.headers().location).toContain("dev-builds/Tetra-Booth-Setup-0.5.3.exe");
    expect((await request.get("/download/booth?v=../x", { maxRedirects: 0 })).status()).toBe(400);
    const row = (
      await db
        .from("devices")
        .select("app_version, status, last_seen_at")
        .eq("id", deviceId)
        .single()
    ).data;
    // Status divalidasi BoothStatus: field asing dibuang.
    expect(row).toMatchObject({ app_version: "0.0.1-e2e" });
    expect(row?.status).toEqual({ printer: { name: null, status: "ready", message: null } });
    expect(row?.last_seen_at).toBeTruthy();

    // N3: event "pilih booth" hanya untuk device yang ditugaskan; "semua booth" (#127) untuk semua device.
    const { data: ev } = await db
      .from("events")
      .insert({
        organization_id: org?.id ?? "",
        name: "e2e event",
        mode: "event",
        event_date: "2026-10-12",
        all_devices: false,
        bundle_version: 2,
        bundle: {
          config: { name: "e2e event" },
          files: [{ file: "overlay.png", sha256: "a".repeat(64), key: "o/e/bundle/aaa.png" }],
        },
      })
      .select("id")
      .single();
    eventId = ev?.id ?? "";
    const listed = async () =>
      (
        (await (await request.get("/api/booth/events", { headers: auth })).json()).events as {
          id: string;
        }[]
      ).filter((e) => e.id === eventId);
    expect(await listed()).toEqual([]);
    expect(
      (await request.get(`/api/booth/events/${eventId}/bundle`, { headers: auth })).status(),
    ).toBe(404);
    await db.from("events").update({ all_devices: true }).eq("id", eventId);
    expect(await listed()).toHaveLength(1);
    await db.from("events").update({ all_devices: false }).eq("id", eventId);
    await db
      .from("event_devices")
      .insert({ organization_id: org?.id ?? "", event_id: eventId, device_id: deviceId });
    expect(await listed()).toEqual([{ id: eventId, name: "e2e event", bundleVersion: 2 }]);
    const m = await (
      await request.get(`/api/booth/events/${eventId}/bundle`, { headers: auth })
    ).json();
    expect(m).toMatchObject({ bundleVersion: 2, config: { id: eventId, name: "e2e event" } });
    expect(m.files[0].url).toMatch(
      /^https:\/\/[0-9a-f]+\.r2\.cloudflarestorage\.com\/[\w-]+\/o\/e\/bundle\/aaa\.png\?X-Amz-/,
    );
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

    // N4: sesi → URL PUT R2 → upload sungguhan → catat aset (partial → complete), semua idempotent.
    const sessionId = `e2e${code}X`.slice(0, 10).replace(/[01]/g, "2");
    const session = {
      id: sessionId,
      eventId,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      photoCount: 3,
      retakeCount: 0,
      printCount: 1,
      assetCount: 2,
    };
    for (let i = 0; i < 2; i++)
      expect(
        (await request.post("/api/booth/sessions", { headers: auth, data: session })).status(),
      ).toBe(200);
    // Event diarsip setelah sesi dipotret offline: sesi tetap diterima (sync idempotent), event hilang dari daftar.
    await db.from("events").update({ status: "archived" }).eq("id", eventId);
    expect(
      (await request.post("/api/booth/sessions", { headers: auth, data: session })).status(),
    ).toBe(200);
    expect(await listed()).toEqual([]);
    await db.from("events").update({ status: "draft" }).eq("id", eventId);
    expect(
      (
        await request.post("/api/booth/sessions", {
          headers: auth,
          data: { ...session, eventId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" },
        })
      ).status(),
    ).toBe(404);
    // Photo Stage (#178): sumber + nama grup tersimpan; upsert ulang = ganti nama; tanpa field = tidak berubah.
    const stageId = `${sessionId.slice(0, 9)}S`;
    const stageSession = { ...session, id: stageId, source: "stage", groupName: "Keluarga Inti" };
    expect(
      (await request.post("/api/booth/sessions", { headers: auth, data: stageSession })).status(),
    ).toBe(200);
    const stageRow = () =>
      db.from("sessions").select("source, group_name").eq("id", stageId).single();
    expect((await stageRow()).data).toEqual({ source: "stage", group_name: "Keluarga Inti" });
    await request.post("/api/booth/sessions", {
      headers: auth,
      data: { ...stageSession, groupName: "Keluarga Besar Bpk. Hadi" },
    });
    expect((await stageRow()).data?.group_name).toBe("Keluarga Besar Bpk. Hadi");
    expect(
      (await db.from("sessions").select("source, group_name").eq("id", sessionId).single()).data,
    ).toEqual({ source: "booth", group_name: null });
    await db.from("sessions").delete().eq("id", stageId);

    const sign = await request.post("/api/booth/uploads/sign", {
      headers: auth,
      data: {
        sessionId,
        assets: [
          { kind: "strip_web", idx: 0 },
          { kind: "thumb_strip", idx: 0 },
        ],
      },
    });
    expect(sign.status()).toBe(200);
    const { uploads } = await sign.json();
    expect(uploads[0].key).toBe(`${org?.id}/${eventId}/sessions/${sessionId}/strip_web_0.jpg`);
    const put = await fetch(uploads[0].url, {
      method: "PUT",
      headers: { "content-type": "image/jpeg" },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    });
    expect(put.status).toBe(200);
    const record = (kind: string) =>
      request.post(`/api/booth/sessions/${sessionId}/assets`, {
        headers: auth,
        data: { assets: [{ kind, idx: 0, bytes: 4 }] },
      });
    expect(await (await record("strip_web")).json()).toEqual({ uploadStatus: "partial" });
    expect(await (await record("strip_web")).json()).toEqual({ uploadStatus: "partial" });
    expect(await (await record("thumb_strip")).json()).toEqual({ uploadStatus: "complete" });

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
