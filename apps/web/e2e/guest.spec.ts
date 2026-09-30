import { expect, test } from "@playwright/test";
import type { Database } from "@tetra/db";
import { db, hasDb } from "./admin-helpers";

/** Halaman tamu /s/{id} (N6): semua state di layar HP 390 px, data uji di Supabase dev. */

test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

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
  // Branding header (admin → Halaman tamu): warna gelap → teks putih, logo menggantikan tanda "T".
  const live = await mkEvent({ branding: { color: "#1d3557", logoKey: `${R2}/strip_web_0.jpg` } });
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
  await db.from("assets").insert([
    asset(ids.partial, "strip_web", 0),
    asset(ids.ready, "strip_web", 0),
    asset(ids.ready, "original", 1),
    // Penampil foto butuh >1 foto: original 2–3 memakai berkas R2 yang sama (kunci beda fragmen).
    { ...asset(ids.ready, "original", 2), r2_key: `${R2}/original_1.jpg#${ids.ready}-2` },
    { ...asset(ids.ready, "original", 3), r2_key: `${R2}/strip_web_0.jpg#${ids.ready}-3` },
    asset(ids.ready, "animation", 0),
    asset(ids.ready, "video", 0),
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
  const header = page.locator("header");
  await expect(header).toHaveCSS("background-color", "rgb(29, 53, 87)");
  await expect(header).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(header.locator("img")).toHaveAttribute("src", /strip_web_0\.jpg/);
  await page.screenshot({ path: "test-results/guest-branding.png" });
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
  // Video hitung mundur (#117).
  await page.getByRole("tab", { name: "Video" }).click();
  await expect(page.locator("video")).toHaveAttribute("src", /video_0/);
  await expect(page.getByRole("button", { name: "Simpan Video ke HP" })).toBeEnabled();
  await page.getByRole("tab", { name: "Strip" }).click();
  await page.getByRole("tab", { name: "Original" }).click();
  await expect(page.getByRole("button", { name: "Original 1" })).toBeVisible();

  // Penampil foto: tap foto → dialog layar penuh, panah/strip thumbnail, Esc & back menutup.
  await page.getByRole("button", { name: "Original 1" }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("1 / 3")).toBeVisible();
  await viewer.getByRole("button", { name: "Foto berikutnya" }).click();
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await expect(viewer.getByRole("button", { name: /^Foto \d dari 3$/ })).toHaveCount(3);
  await expect(viewer.getByRole("button", { name: "Foto 2 dari 3" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(viewer.getByRole("img", { name: "Foto 2 dari 3" })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Simpan foto ini" })).toBeEnabled();
  await page.screenshot({ path: "test-results/guest-viewer.png", animations: "disabled" });
  // Zoom: klik dua kali → foto membesar; ganti foto → foto berikutnya 1×.
  const scale = (name: string) =>
    viewer.getByRole("img", { name }).evaluate((el) => {
      const t = getComputedStyle(el).transform;
      return t === "none" ? 1 : new DOMMatrix(t).a;
    });
  await viewer.getByRole("img", { name: "Foto 2 dari 3" }).dblclick();
  await expect.poll(() => scale("Foto 2 dari 3")).toBeGreaterThan(1);
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("3 / 3")).toBeVisible();
  expect(await scale("Foto 3 dari 3")).toBe(1);
  // Geser ke kanan (swipe) → foto sebelumnya.
  await page.mouse.move(80, 422);
  await page.mouse.down();
  await page.mouse.move(280, 422, { steps: 8 });
  await page.mouse.up();
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(page.getByRole("button", { name: "Original 1" })).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`/s/${ids.ready}$`));
  // Tombol back browser menutup penampil, tetap di halaman.
  await page.getByRole("button", { name: "Original 2" }).click();
  await expect(viewer.getByText("2 / 3")).toBeVisible();
  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(page.getByRole("button", { name: "Original 2" })).toBeVisible();

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
