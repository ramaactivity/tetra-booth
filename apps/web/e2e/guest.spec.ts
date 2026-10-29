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

test("ready: semua hasil satu halaman, pratinjau, simpan semua & satuan, masa berlaku", async ({
  page,
}) => {
  await page.goto(`/s/${ids.ready}`);
  const strip = page.locator("img").first();
  await expect(strip).toHaveJSProperty("complete", true);
  expect(await strip.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText("11 Nov 2026")).toBeVisible();
  // Revisi 29 Okt: tanpa tab; satu tombol menyimpan semua (strip + 3 foto + animasi + video).
  await expect(page.getByRole("tab")).toHaveCount(0);
  const saveAll = page.getByRole("button", { name: "Simpan semua (6) ke galeri" });
  await expect(saveAll).toBeEnabled();
  for (const name of ["Foto 1", "Foto 2", "Foto 3", "Animasi", "Video"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute("src", /video_0/);
  // Foto asli tidak dipotong: rasio tampil = rasio berkas.
  const ratio = await page
    .getByRole("button", { name: "Foto 1", exact: true })
    .locator("img")
    .evaluate((i: HTMLImageElement) => [
      i.naturalWidth / i.naturalHeight,
      i.getBoundingClientRect().width / i.getBoundingClientRect().height,
    ]);
  expect(Math.abs((ratio[0] ?? 0) - (ratio[1] ?? 0))).toBeLessThan(0.02);
  // Strip muat di layar di atas tombol simpan (dulu tertutup).
  const stripBottom = await strip.evaluate((i) => i.getBoundingClientRect().bottom);
  const footerTop = await page
    .locator("footer")
    .first()
    .evaluate((f) => f.getBoundingClientRect().top);
  expect(stripBottom).toBeLessThanOrEqual(footerTop);
  await page.screenshot({ path: "test-results/guest-ready.png" });

  // Penampil: ketuk foto → layar penuh berisi semua 6 item, simpan satuan.
  await page.getByRole("button", { name: "Foto 1", exact: true }).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText("2 / 6")).toBeVisible();
  await viewer.getByRole("button", { name: "Foto berikutnya" }).click();
  await expect(viewer.getByText("3 / 6")).toBeVisible();
  await expect(viewer.getByRole("button", { name: /^Foto \d dari 6$/ })).toHaveCount(6);
  await expect(viewer.getByRole("button", { name: "Foto 3 dari 6" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  await expect(viewer.getByRole("img", { name: "Foto 3 dari 6" })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Simpan foto ini" })).toBeEnabled();
  await page.screenshot({ path: "test-results/guest-viewer.png", animations: "disabled" });
  // Zoom: klik dua kali → foto membesar; ganti foto → foto berikutnya 1×.
  const scale = (name: string) =>
    viewer.getByRole("img", { name }).evaluate((el) => {
      const t = getComputedStyle(el).transform;
      return t === "none" ? 1 : new DOMMatrix(t).a;
    });
  await viewer.getByRole("img", { name: "Foto 3 dari 6" }).dblclick();
  await expect.poll(() => scale("Foto 3 dari 6")).toBeGreaterThan(1);
  await page.keyboard.press("ArrowRight");
  await expect(viewer.getByText("4 / 6")).toBeVisible();
  expect(await scale("Foto 4 dari 6")).toBe(1);
  // Geser ke kanan (swipe) → foto sebelumnya.
  await page.mouse.move(80, 422);
  await page.mouse.down();
  await page.mouse.move(280, 422, { steps: 8 });
  await page.mouse.up();
  await expect(viewer.getByText("3 / 6")).toBeVisible();
  // Video ikut bisa dipratinjau & disimpan satuan.
  await viewer.getByRole("button", { name: "Foto 6 dari 6" }).click();
  await expect(viewer.getByRole("button", { name: "Simpan video ini" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(page).toHaveURL(new RegExp(`/s/${ids.ready}$`));
  // Tombol back browser menutup penampil, tetap di halaman.
  await page.getByRole("button", { name: "Foto 2", exact: true }).click();
  await expect(viewer.getByText("3 / 6")).toBeVisible();
  await page.goBack();
  await expect(viewer).toBeHidden();
  await expect(page.getByRole("button", { name: "Foto 2", exact: true })).toBeVisible();

  // Simpan semua (Android/desktop): 6 unduhan langsung, nama rapi, bukan zip.
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await saveAll.click();
  await expect.poll(() => downloads.length, { timeout: 15_000 }).toBe(6);
  expect(downloads.sort()).toEqual(
    ["strip.jpg", "foto-1.jpg", "foto-2.jpg", "foto-3.jpg", "animasi.gif", "video.mp4"]
      .map((f) => `andi-sari-${ids.ready.slice(0, 4)}-${f}`)
      .sort(),
  );
  // N7: qr_open saat buka, save_all saat simpan semua → analytics_events.
  await expect
    .poll(async () =>
      ((await db.from("analytics_events").select("type").eq("session_id", ids.ready)).data ?? [])
        .map((r) => r.type)
        .sort(),
    )
    .toEqual(["qr_open", "save_all"]);
});

test("ready di iPhone: simpan semua lewat share sheet (masuk app Foto), satuan juga", async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  // Share sheet Safari tiruan: catat file yang dibagikan.
  await ctx.addInitScript(() => {
    const w = window as unknown as { shared: string[][] };
    w.shared = [];
    Object.assign(navigator, {
      canShare: (d: { files?: File[] }) => !!d.files?.length,
      share: async (d: { files: File[] }) => {
        w.shared.push(d.files.map((f) => f.name));
      },
    });
  });
  const page = await ctx.newPage();
  await page.goto(`/s/${ids.ready}`);
  await page.getByRole("button", { name: "Simpan semua (6) ke galeri" }).click();
  const shared = () => page.evaluate(() => (window as unknown as { shared: string[][] }).shared);
  await expect.poll(async () => (await shared())[0]?.length).toBe(6);
  await expect(page.getByText("Tersimpan, cek galeri HP-mu")).toBeVisible();
  await page.getByRole("button", { name: "Animasi", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan animasi ini" }).click();
  await expect
    .poll(async () => (await shared())[1])
    .toEqual([`andi-sari-${ids.ready.slice(0, 4)}-animasi.gif`]);
  await ctx.close();
});

test("removed & expired: foto tidak tersedia + ajakan kontak", async ({ page }) => {
  await page.goto(`/s/${ids.removed}`);
  await expect(page.getByText("Foto ini sudah dihapus oleh penyelenggara acara")).toBeVisible();
  await page.goto(`/s/${ids.expired}`);
  await expect(page.getByText(/berakhir pada 1 Sep 2026/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Hubungi Tetra Photobooth/ })).toBeVisible();
  await page.screenshot({ path: "test-results/guest-expired.png" });
});
