import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";

/**
 * API Guest Cam G1 (#197) terhadap Supabase + R2 dev: join (kontak wajib, idempoten per cookie), unggah foto
 * sampai jatah habis, idx di luar jatah ditolak, file kebesaran dihapus, approval manual → pending (tamu tetap lihat
 * fotonya sendiri), link dicabut → 404.
 */

const envFile = join(__dirname, "../.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
test.skip(!url || !key, "butuh Supabase dev (apps/web/.env.local)");
// Kamera palsu Chromium untuk tes halaman /c (harus top-level: launchOptions memaksa worker baru).
test.use({
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

const JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
  "base64",
);

test("guest cam: join → unggah sampai jatah habis → batas ukuran → approval → cabut link", async ({
  request,
}) => {
  // Unggah 8,5 MB ke R2 + kompilasi route pertama di dev server.
  test.setTimeout(180_000);
  const db = createClient<Database>(url ?? "", key ?? "", { auth: { persistSession: false } });
  const org = (await db.from("organizations").select("id").eq("slug", "tetra").single()).data;
  const token = `e2e-gc-${Date.now()}`;
  const ip = { "x-forwarded-for": token };
  const { data: ev, error } = await db
    .from("events")
    .insert({
      organization_id: org?.id ?? "",
      name: `e2e guest cam ${Date.now()}`,
      mode: "event",
      event_date: "2026-12-31",
      guest_token: token,
      settings: { guestCam: { enabled: true, shots: 2, reveal: "live", approval: "manual" } },
    })
    .select("id, slug")
    .single();
  expect(error).toBeNull();
  const base = `/api/c/${ev?.slug}`;
  try {
    const info = await request.get(base);
    expect(info.status()).toBe(200);
    expect(await info.json()).toMatchObject({ shots: 2, reveal: "live", filters: ["normal"] });

    expect((await request.get(`${base}/me`)).status()).toBe(401);
    const bad = await request.post(`${base}/join`, {
      headers: ip,
      data: { name: "Sari", consent: true },
    });
    expect(bad.status()).toBe(400);

    const join = await request.post(`${base}/join`, {
      headers: ip,
      data: { name: "Sari", instagram: "@sari.e2e", consent: true },
    });
    expect(join.status()).toBe(200);
    const me = await join.json();
    expect(me).toMatchObject({ name: "Sari", shotsLeft: 2, usedIdx: [] });
    const again = await request.post(`${base}/join`, {
      headers: ip,
      data: { name: "Lain", whatsapp: "08123456789", consent: true },
    });
    expect((await again.json()).sessionId).toBe(me.sessionId);

    const upload = async (idx: number, body: Buffer = JPEG) => {
      const sign = await request.post(`${base}/sign`, {
        headers: ip,
        data: { kind: "photo", idx },
      });
      if (sign.status() !== 200) return sign.status();
      for (const u of (await sign.json()).uploads)
        expect(
          (
            await request.put(u.url, {
              headers: { "Content-Type": u.contentType },
              data: u.part === "main" ? body : JPEG,
            })
          ).ok(),
        ).toBe(true);
      return (
        await request.post(`${base}/done`, { headers: ip, data: { kind: "photo", idx } })
      ).status();
    };
    expect(await upload(0)).toBe(200);
    expect(await upload(0)).toBe(200); // kirim ulang idx sama = idempoten
    expect(await upload(2)).toBe(400); // di luar jatah 2 foto
    expect(await upload(1, Buffer.alloc(8_500_000, 1))).toBe(400); // kebesaran → dihapus

    const mine = await (await request.get(`${base}/me`)).json();
    expect(mine).toMatchObject({ shotsLeft: 1, usedIdx: [0], revealed: true });
    // Approval manual: tamu tetap melihat fotonya sendiri; album/TV menunggu disetujui (review_status pending).
    expect(mine.photos.map((p: { idx: number }) => p.idx)).toEqual([0]);
    const { data: assets } = await db
      .from("assets")
      .select("kind, review_status")
      .eq("session_id", me.sessionId);
    expect(assets?.map((a) => a.review_status)).toEqual(["pending", "pending"]);
    const { data: lead } = await db
      .from("leads")
      .select("data")
      .eq("session_id", me.sessionId)
      .single();
    expect(lead?.data).toMatchObject({ name: "Sari", instagram: "sari.e2e", source: "guest_cam" });

    await db
      .from("events")
      .update({ guest_token: null })
      .eq("id", ev?.id ?? "");
    expect((await request.get(base)).status()).toBe(404);
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
  }
});

test.describe("halaman tamu /c (kamera palsu Chromium)", () => {
  test.use({
    permissions: ["camera", "microphone"],
    viewport: { width: 390, height: 844 },
  });

  test("daftar → kamera → jepret 2× → jatah habis → foto terunggah", async ({ page }) => {
    test.setTimeout(180_000);
    const db = createClient<Database>(url ?? "", key ?? "", { auth: { persistSession: false } });
    const org = (await db.from("organizations").select("id").eq("slug", "tetra").single()).data;
    const token = `e2e-gcp-${Date.now()}`;
    const { data: ev } = await db
      .from("events")
      .insert({
        organization_id: org?.id ?? "",
        name: `e2e guest cam page ${Date.now()}`,
        mode: "event",
        event_date: "2026-12-31",
        guest_token: token,
        settings: { filters: ["bw"], guestCam: { enabled: true, shots: 2, reveal: "live" } },
        bundle: {
          config: {
            layout: {
              id: "strip-e2e",
              version: 1,
              paper: "2x6x2",
              canvas: { width: 600, height: 1800, dpi: 300 },
              background: { color: "#ffffff" },
              slots: [0, 1].map((i) => ({
                id: `s${i}`,
                x: 30,
                y: 30 + i * 600,
                w: 540,
                h: 540,
                fit: "cover",
                z: "below_overlay",
              })),
              texts: [],
            },
            assets: {},
          },
          files: [],
        },
      })
      .select("id, slug")
      .single();
    try {
      await page.goto(`/c/${ev?.slug}`);
      await page.getByLabel("Nama kamu").fill("Sari");
      await page.getByRole("button", { name: "Instagram" }).click();
      await page.getByLabel("Instagram").fill("@sari.e2e");
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Mulai motret" }).click();
      await page.getByRole("button", { name: "Nyalakan kamera" }).click();
      await expect(page.getByText("2 foto lagi")).toBeVisible();
      await page.getByRole("button", { name: "Hitam Putih" }).click();
      const shutter = page.getByRole("button", { name: "Jepret" });
      await expect(shutter).toBeEnabled();
      await shutter.click();
      await expect(page.getByText("1 foto lagi")).toBeVisible();
      await expect(shutter).toBeEnabled();
      await shutter.click();
      await expect(page.getByText("Jatah fotomu habis")).toBeVisible();
      await expect(page.getByText("Semua foto terkirim")).toBeVisible({ timeout: 60_000 });
      await page.getByRole("button", { name: "Foto saya" }).click();
      await expect(page.getByRole("listitem")).toHaveCount(2);

      // G3: ucapan suara (mic palsu Chromium) dan strip virtual dari 2 foto.
      await page.getByRole("button", { name: "Rekam ucapan" }).click();
      await page.getByRole("button", { name: "Mulai rekam" }).click();
      await page.waitForTimeout(1500);
      await page.getByRole("button", { name: "Selesai" }).click();
      await page.getByRole("button", { name: "Kirim ucapan" }).click();
      await expect(page.getByText("Ucapanmu sudah terkirim")).toBeVisible();
      await page.getByRole("button", { name: "Buat strip" }).click();
      for (const _ of [0, 1]) await page.locator('button[aria-pressed="false"]').first().click();
      await page.getByRole("button", { name: "Buat strip" }).click();
      await page.getByRole("button", { name: "Kirim ke album" }).click();
      await expect(page.getByText("Strip saya")).toBeVisible({ timeout: 60_000 });
      const { data: kinds } = await db
        .from("assets")
        .select("kind, sessions!inner(event_id)")
        .eq("sessions.event_id", ev?.id ?? "");
      expect(kinds?.map((k) => k.kind).sort()).toEqual([
        "audio",
        "original",
        "original",
        "strip_web",
        "thumb_original",
        "thumb_original",
        "thumb_strip",
      ]);
      const { data: s } = await db
        .from("sessions")
        .select("photo_count, group_name")
        .eq("event_id", ev?.id ?? "")
        .single();
      expect(s).toEqual({ photo_count: 2, group_name: "Sari" });
    } finally {
      await db
        .from("events")
        .delete()
        .eq("id", ev?.id ?? "");
    }
  });
});
