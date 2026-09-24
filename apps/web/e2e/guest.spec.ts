import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";

/** Halaman tamu /s/{id} (N6): semua state di layar HP 390 px, data uji di Supabase dev. */

const envFile = join(__dirname, "../.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
test.skip(!url || !key, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

const db = createClient<Database>(url ?? "", key ?? "", { auth: { persistSession: false } });
const suffix = String(Date.now()).slice(-6).replace(/[01]/g, "3");
const ids = {
  pending: `pnd${suffix}a`,
  partial: `prt${suffix}a`,
  ready: `rdy${suffix}a`,
  removed: `rmv${suffix}a`,
  expired: `exp${suffix}a`,
};
// Aset R2 nyata dari uji N4 (strip biru uji).
const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";
let org = "";
let device = "";
const events: string[] = [];

test.beforeAll(async () => {
  org = (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  device =
    (
      await db
        .from("devices")
        .select("id")
        .eq("organization_id", org)
        .eq("short_code", "B01")
        .single()
    ).data?.id ?? "";
  const mkEvent = async (extra: Partial<Database["public"]["Tables"]["events"]["Insert"]> = {}) => {
    const { data } = await db
      .from("events")
      .insert({
        organization_id: org,
        name: "Andi & Sari",
        mode: "event",
        event_date: "2026-10-12",
        guest_expires_at: "2026-11-11T10:00:00Z",
        ...extra,
      })
      .select("id")
      .single();
    events.push(data?.id ?? "");
    return data?.id ?? "";
  };
  const live = await mkEvent();
  const gone = await mkEvent({ guest_expires_at: "2026-09-01T10:00:00Z" });
  const session = (id: string, event: string, extra = {}) =>
    db.from("sessions").insert({
      id,
      organization_id: org,
      event_id: event,
      device_id: device,
      started_at: "2026-10-12T14:42:00Z",
      asset_count: 5,
      ...extra,
    });
  await session(ids.pending, live);
  await session(ids.partial, live, { upload_status: "partial" });
  await session(ids.ready, live, { upload_status: "complete" });
  await session(ids.removed, live, { hidden_at: new Date().toISOString() });
  await session(ids.expired, gone, { upload_status: "complete" });
  const asset = (sid: string, kind: string, idx: number) => ({
    organization_id: org,
    session_id: sid,
    kind,
    idx,
    r2_key: `${R2}/${kind}_${idx}.jpg#${sid}`,
  });
  await db
    .from("assets")
    .insert([
      asset(ids.partial, "strip_web", 0),
      asset(ids.ready, "strip_web", 0),
      asset(ids.ready, "original", 1),
      asset(ids.ready, "animation", 0),
    ]);
});

test.afterAll(async () => {
  for (const e of events) await db.from("events").delete().eq("id", e);
});

test("unknown: ID belum sampai, refresh otomatis", async ({ page }) => {
  await page.goto("/s/zzzzzzzzzz");
  await expect(page.getByRole("heading", { name: "Foto kamu belum sampai" })).toBeVisible();
  await page.screenshot({ path: "test-results/guest-unknown.png" });
});

test("pending: header event, langkah pengiriman", async ({ page }) => {
  await page.goto(`/s/${ids.pending}`);
  await expect(page.getByRole("heading", { name: "Andi & Sari" })).toBeVisible();
  await expect(page.getByText("12 Oktober 2026")).toBeVisible();
  await expect(page.getByText("Menunggu koneksi booth")).toBeVisible();
  await expect(page.getByText("21.42 · di booth")).toBeVisible();
  await page.screenshot({ path: "test-results/guest-pending.png" });
  await page.goto(`/s/${ids.partial}`);
  await expect(page.getByText("1 dari 5 file sudah sampai")).toBeVisible();
});

test("ready: strip, tab original, simpan, masa berlaku", async ({ page }) => {
  await page.goto(`/s/${ids.ready}`);
  const strip = page.locator("img").first();
  await expect(strip).toHaveJSProperty("complete", true);
  expect(await strip.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("11 Nov 2026")).toBeVisible();
  await expect(page.getByRole("button", { name: "Simpan ke Galeri HP" })).toBeEnabled();
  await page.screenshot({ path: "test-results/guest-ready.png" });
  await page.getByRole("tab", { name: "Animasi" }).click();
  await expect(page.getByRole("button", { name: "Simpan GIF ke HP" })).toBeEnabled();
  await page.getByRole("tab", { name: "Strip" }).click();
  await page.getByRole("tab", { name: "Original" }).click();
  await expect(page.getByRole("button", { name: "Original 1" })).toBeVisible();

  // N7: qr_open saat buka, save saat simpan → analytics_events.
  await page.getByRole("button", { name: "Simpan ke Galeri HP" }).click();
  await expect
    .poll(async () =>
      ((await db.from("analytics_events").select("type").eq("session_id", ids.ready)).data ?? [])
        .map((r) => r.type)
        .sort(),
    )
    .toEqual(["qr_open", "save"]);
});

test("removed & expired: foto tidak tersedia + ajakan kontak", async ({ page }) => {
  await page.goto(`/s/${ids.removed}`);
  await expect(page.getByText("Foto ini sudah dihapus oleh penyelenggara acara")).toBeVisible();
  await page.goto(`/s/${ids.expired}`);
  await expect(page.getByText(/berakhir pada 1 Sep 2026/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Hubungi Tetra Photobooth/ })).toBeVisible();
  await page.screenshot({ path: "test-results/guest-expired.png" });
});
