import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { createEventViaWizard, db, hasDb, login, makeUser } from "./admin-helpers";

/** A3/A4: buat event → pengaturan + template → tugaskan booth → booth menarik bundle lewat API. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const sha = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

test("buat event, atur template + overlay, tugaskan booth, booth menarik bundle", async ({
  page,
  request,
}) => {
  // Simpan pengaturan menulis bundle + aset ke R2: bisa > 5 dtk per simpan di jaringan lambat.
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const token = randomBytes(40).toString("base64url");
  const name = `e2e event ${Date.now()}`;
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: u.org,
      name: `e2e booth ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      short_code: `E${Date.now() % 1e6}`,
      token_hash: sha(Buffer.from(token)),
    })
    .select("id, name")
    .single();
  try {
    await login(page, u);
    // Wizard Buat event (Strip Klasik, semua booth), lalu lanjut ke Pengaturan.
    await createEventViaWizard(page, { name, paper: /Strip 2R/, designs: ["Strip Klasik"] });
    await page.getByRole("link", { name: "Pengaturan lanjutan" }).click();
    await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();
    // Kepala = kesiapan event; navigasi kiri per kelompok (#128).
    await expect(page.getByRole("navigation", { name: "Bagian pengaturan" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Siap dipakai di booth" })).toContainText(
      "Strip Klasik",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.screenshot({ path: "test-results/settings-top.png" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: "test-results/settings-top-1440.png" });
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.getByLabel(/Teks kecil di layar booth/).fill("The Wedding of");
    // Ada perubahan belum disimpan: klik link keluar → konfirmasi; batal = tetap di halaman pengaturan.
    let asked = "";
    page.once("dialog", (d) => {
      asked = d.message();
      void d.dismiss();
    });
    await page.getByRole("main").getByRole("link", { name, exact: true }).first().click();
    await page.waitForTimeout(500);
    expect(asked).toContain("belum disimpan");
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText("Ada perubahan belum disimpan")).toBeVisible();
    // Desain frame: hanya desain terpilih yang tampil. Event baru = Strip Klasik (2R), jadi pemilih
    // hanya menampilkan desain 2R (4R disembunyikan, bukan dinonaktifkan).
    const frames = page.getByRole("group", { name: "Desain frame" });
    const add = frames.getByRole("button", { name: /Tambah desain/ });
    const picker = page.getByRole("dialog", { name: "Tambah desain frame" });
    await add.click();
    await expect(picker).toContainText("Hanya desain 2R 2x6");
    await expect(picker.getByRole("button", { name: /^Strip 4/ })).toBeVisible();
    await expect(picker.getByRole("button", { name: /^4R Grid/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await frames.getByRole("button", { name: "Lepas Strip Klasik" }).click();
    await expect(page.getByRole("region", { name: "Siap dipakai di booth" })).toContainText(
      "Pilih minimal satu desain",
    );
    await add.click();
    await picker.getByRole("textbox", { name: "Cari nama desain" }).fill("4R");
    await expect(picker.locator("img").first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/settings-design-picker.png" });
    await picker.getByRole("button", { name: /^4R Grid/ }).click();
    await expect(picker.getByRole("img", { name: "Pratinjau 4R Grid", exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: "test-results/settings-design-picker-detail.png" });
    await picker.getByRole("button", { name: "Pakai desain ini" }).click();
    await add.click();
    await picker.getByRole("button", { name: /^4R Single/ }).click();
    await picker.getByRole("button", { name: "Pakai desain ini" }).click();
    await expect(frames.getByText("Utama", { exact: true })).toBeVisible();
    for (const n of ["4R Grid", "4R Single"])
      await expect(frames.getByRole("img", { name: `Pratinjau ${n}`, exact: true })).toBeVisible({
        timeout: 15_000,
      });
    await page.locator("#template").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/settings-designs.png" });
    await page.locator("#template").screenshot({ path: "test-results/admin-design-frame.png" });
    await page
      .locator('input[name="overlay"]')
      .setInputFiles({ name: "ov.png", mimeType: "image/png", buffer: PNG });
    await page
      .locator('input[name="logo"]')
      .setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    // Suara (#104): angka 3 dimatikan, jepret diganti file sendiri.
    await page.locator('input[name="snd_on_3"]').uncheck({ force: true });
    await page.locator('input[name="snd_file_jepret"]').setInputFiles({
      name: "klik.wav",
      mimeType: "audio/wav",
      buffer: Buffer.from("RIFF0000WAVEfmt "),
    });
    await page.getByLabel("Maks. cetak per sesi").fill("3");
    await page.getByLabel(/Pilih booth/).check();
    await page.getByLabel(dev?.name ?? "").check();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v3", {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle"); // refresh RSC setelah simpan selesai dulu
    await page.screenshot({ path: "test-results/admin-settings.png", fullPage: true });

    const auth = { Authorization: `Bearer ${token}` };
    const { events } = await (await request.get("/api/booth/events", { headers: auth })).json();
    const ev = events.find((e: { name: string }) => e.name === name);
    expect(ev?.bundleVersion).toBe(3);
    // Logo halaman tamu tersimpan di branding (R2, folder event), tidak ikut bundle booth.
    const { data: row } = await db.from("events").select("branding").eq("id", ev.id).single();
    expect((row?.branding as { logoKey?: string } | undefined)?.logoKey).toMatch(
      new RegExp(`/${ev.id}/branding/[0-9a-f]{64}\\.png$`),
    );
    const m = await (
      await request.get(`/api/booth/events/${ev.id}/bundle`, { headers: auth })
    ).json();
    expect(m.config).toMatchObject({
      name,
      tagline: "The Wedding of",
      date: "12 Oktober 2026",
      layout: { paper: "4R", overlay: { assetId: "ov" } },
      settings: { maxPrints: 3 },
      assets: { ov: "overlay.png" },
    });
    expect(m.config.layout.slots).toHaveLength(4);
    expect(m.config.sounds).toEqual({ "3": "off", jepret: "snd-jepret" });
    expect(m.config.assets["snd-jepret"]).toBe("snd-jepret.wav");
    // Desain tambahan (#99): tamu memilih 4R Grid (utama, dengan overlay) atau 4R Single.
    expect(m.config.designs.map((d: { name: string }) => d.name)).toEqual(["4R Grid", "4R Single"]);
    const file = await fetch(m.files[0].url);
    expect(file.status).toBe(200);
    expect(sha(new Uint8Array(await file.arrayBuffer()))).toBe(m.files[0].sha256);

    // "Salin & sesuaikan": salinan preset jadi template event ini (menggantikan 4R Single), editor terbuka.
    await page.getByRole("button", { name: "Salin & sesuaikan 4R Single" }).click();
    await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const copyId = page.url().split("/").pop() ?? "";
    const { data: cp } = await db.from("layouts").select("name").eq("id", copyId).single();
    expect(cp?.name).toBe(`${name} · 4R Single`);
    const { data: withCopy } = await db.from("events").select("settings").eq("id", ev.id).single();
    expect(withCopy?.settings).toMatchObject({
      template: { preset: "4r-grid", extras: [`tpl:${copyId}`], versions: { [copyId]: 1 } },
    });
    await page.goto(`/admin/events/${ev.id}`);
    await expect(page.getByRole("region", { name: "Desain frame" })).toContainText(
      `${name} · 4R Single`,
    );
    await expect(page.getByRole("link", { name: `Edit desain ${name} · 4R Single` })).toBeVisible();
    await page.screenshot({ path: "test-results/admin-event-dashboard.png" });
    await page.getByRole("link", { name: "Ganti desain" }).click();
    await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();

    // Fase 4: mode photobox butuh minimal satu layout dijual; bundle memuat layout + harga.
    await page.getByText("Mode Photobox", { exact: true }).click();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("centang minimal satu layout", {
      timeout: 30_000,
    });
    const sold = page.getByRole("group", { name: /Layout yang dijual/ });
    await sold.getByRole("checkbox", { name: /4R Grid/ }).check();
    await page.getByLabel("Harga 4R Grid").fill("35000");
    await sold.getByRole("checkbox", { name: /Strip Klasik/ }).check();
    await page.getByLabel("Harga Strip Klasik").fill("25000");
    await page.getByLabel("Harga lembar tambahan").fill("10000");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v5", {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle"); // refresh RSC setelah simpan selesai dulu
    const pb = await (
      await request.get(`/api/booth/events/${ev.id}/bundle`, { headers: auth })
    ).json();
    expect(pb.config.mode).toBe("photobox");
    expect(pb.config.photobox.extraPrintPrice).toBe(10000);
    expect(
      pb.config.photobox.layouts.map((l: { id: string; price: number }) => [l.id, l.price]),
    ).toEqual([
      ["strip-3", 25000],
      ["4r-grid", 35000],
    ]);

    // Fase 5 L1: lead capture butuh teks persetujuan; versi = hash teks.
    await page.getByLabel(/Minta data tamu/).check();
    await expect(page.getByLabel(/Teks persetujuan/)).toBeVisible();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("isi teks persetujuan", {
      timeout: 30_000,
    });
    await page.getByLabel(/Teks persetujuan/).fill("Saya setuju data saya dipakai untuk promo.");
    await page.getByLabel("Wajib: foto tampil setelah form diisi").check();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v6", {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle"); // refresh RSC setelah simpan selesai dulu
    const { data: lc } = await db.from("events").select("lead_capture").eq("id", ev.id).single();
    expect(lc?.lead_capture).toMatchObject({
      enabled: true,
      mode: "gate",
      fields: ["name", "whatsapp"],
      consentVersion: expect.stringMatching(/^[0-9a-f]{10}$/),
    });

    // Event ini sudah jadi photobox (di atas): daftar Photobox (#156).
    await page.goto("/admin/photobox");
    await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText(dev?.name ?? "");
  } finally {
    await db.from("events").delete().eq("name", name);
    const { data: copies } = await db
      .from("layouts")
      .select("id")
      .eq("name", `${name} · 4R Single`);
    for (const c of copies ?? []) {
      await db.from("layout_versions").delete().eq("layout_id", c.id);
      await db.from("layouts").delete().eq("id", c.id);
    }
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await u.cleanup();
  }
});

test("duplikat template: salinan versi 1 dengan aset yang sama, lalu editor terbuka", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const u = await makeUser("owner");
  const name = `e2e tpl ${Date.now()}`;
  const { data: l } = await db
    .from("layouts")
    .insert({ organization_id: u.org, name, paper: "4R" })
    .select("id")
    .single();
  const id = l?.id ?? "";
  const files = {
    ov: { file: "ov.png", sha256: "a".repeat(64), key: `${u.org}/layouts/${id}/x.png` },
  };
  const layout = {
    id,
    version: 2,
    paper: "4R",
    canvas: { width: 1200, height: 1800, dpi: 300 },
    slots: [{ id: "s1", x: 40, y: 40, w: 1120, h: 1440, fit: "cover", z: "below_overlay" }],
    texts: [],
    overlay: { assetId: "ov" },
  };
  await db.from("layout_versions").insert([
    {
      organization_id: u.org,
      layout_id: id,
      version: 1,
      spec: { layout: { ...layout, version: 1 }, files: {} },
    },
    { organization_id: u.org, layout_id: id, version: 2, spec: { layout, files } },
  ]);
  try {
    await login(page, u);
    await page.goto("/admin/templates");
    await page.screenshot({ path: "test-results/admin-templates-list.png" });
    await page.getByRole("button", { name: `Lainnya untuk ${name}` }).click();
    await page.getByRole("button", { name: `Duplikat ${name}` }).click();
    await expect(page).toHaveURL(/\/admin\/templates\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const copyId = page.url().split("/").pop() ?? "";
    expect(copyId).not.toBe(id);
    const { data: copy } = await db
      .from("layouts")
      .select("name, paper, organization_id, layout_versions(version, spec)")
      .eq("id", copyId)
      .single();
    expect(copy).toMatchObject({ name: `${name} (salinan)`, paper: "4R", organization_id: u.org });
    expect(copy?.layout_versions).toHaveLength(1);
    // Versi terbaru (v2) disalin jadi v1; kunci R2 aset dipakai bersama (immutable, berbasis hash).
    expect(copy?.layout_versions[0]).toMatchObject({
      version: 1,
      spec: { layout: { id: copyId, version: 1, overlay: { assetId: "ov" } }, files },
    });
  } finally {
    const { data: all } = await db.from("layouts").select("id").like("name", `${name}%`);
    for (const x of all ?? []) {
      await db.from("layout_versions").delete().eq("layout_id", x.id);
      await db.from("layouts").delete().eq("id", x.id);
    }
    await u.cleanup();
  }
});

test("wizard buat event: validasi per langkah, isian tetap saat kembali, bundle sesuai pilihan", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const name = `e2e wizard ${Date.now()}`;
  const next = page.getByRole("button", { name: /^Lanjut/ });
  const shot = async (n: number | string) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: `test-results/wizard-${n}.png`, fullPage: true });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `test-results/wizard-${n}-1440.png`, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
  };
  try {
    await login(page, u);
    await page.getByRole("link", { name: "Buat Event" }).click();
    await expect(page).toHaveURL(/\/admin\/events\/new$/);
    await expect(page.getByText("Langkah 1 dari 5")).toBeVisible();
    // Langkah 1: nama & tanggal wajib.
    await next.click();
    await expect(page.getByText("Isi nama event.")).toBeVisible();
    await expect(page.getByText("Pilih tanggal event.")).toBeVisible();
    await page.getByLabel("Nama event").fill(name);
    await page.getByLabel("Tanggal event").fill("2026-10-12");
    await page.getByLabel(/Lokasi/).fill("Gedung Sate");
    await page.getByLabel(/Teks kecil di layar booth/).fill("The Wedding of");
    await shot(1);
    await next.click();

    // Langkah 2: mode wajib dipilih. Tutup tidak sengaja → konfirmasi; batal = tetap di wizard.
    await expect(page.getByText("Langkah 2 dari 5")).toBeVisible();
    let asked = "";
    page.once("dialog", (d) => {
      asked = d.message();
      void d.dismiss();
    });
    await page.getByRole("link", { name: "Batal" }).click();
    await page.waitForTimeout(500);
    expect(asked).toContain("Isian di wizard akan hilang");
    await expect(page).toHaveURL(/\/admin\/events\/new$/);
    await next.click();
    await expect(page.getByText("Pilih salah satu mode.")).toBeVisible();
    await page.getByRole("radio", { name: /^Event/ }).check();
    await shot(2);
    await next.click();

    // Langkah 3: kertas dulu, lalu 1–3 desain; Strip 4 Foto disalin jadi template event ini.
    await next.click();
    await expect(page.getByText("Pilih ukuran kertas dulu.")).toBeVisible();
    await page.getByRole("radio", { name: /Strip 2R/ }).check();
    await next.click();
    await expect(page.getByText("Tambah minimal satu desain frame.")).toBeVisible();
    const picker = page.getByRole("dialog", { name: "Tambah desain frame" });
    for (const d of ["Strip Klasik", "Strip 4 Foto"]) {
      await page.getByRole("button", { name: /Tambah desain/ }).click();
      // Hanya desain 2R: 4R tidak ditawarkan.
      await expect(picker.getByRole("button", { name: /^4R Grid/ })).toHaveCount(0);
      await picker
        .getByRole("button", { name: new RegExp(`^${d}`) })
        .first()
        .click();
      await picker.getByRole("button", { name: "Pakai desain ini" }).click();
    }
    await page.getByRole("button", { name: "Salin & sesuaikan Strip 4 Foto" }).click();
    await expect(
      page.getByRole("button", { name: "Salin & sesuaikan Strip 4 Foto" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("img", { name: "Pratinjau Strip Klasik" })).toBeVisible({
      timeout: 15_000,
    });
    await shot(3);
    // Kembali tidak menghapus isian.
    await page.getByRole("button", { name: "Kembali" }).click();
    await page.getByRole("button", { name: "Kembali" }).click();
    await expect(page.getByLabel("Nama event")).toHaveValue(name);
    await next.click();
    await next.click();
    await expect(page.getByRole("article", { name: "Strip 4 Foto" })).toBeVisible();
    await next.click();

    // Langkah 4: bawaan Semua booth.
    await expect(page.getByRole("radio", { name: /^Semua booth/ })).toBeChecked();
    await shot(4);
    await next.click();

    // Langkah 5: ringkasan + langkah berikutnya, lalu buat.
    await expect(page.getByText("Langkah 5 dari 5")).toBeVisible();
    await expect(page.getByText("disalin jadi template baru")).toBeVisible();
    await expect(page.getByText(`Pilih “${name}”.`)).toBeVisible();
    await shot("5-ringkasan");
    await page.getByRole("button", { name: "Buat event" }).click();
    await expect(page.getByRole("link", { name: "Edit desain" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Pengaturan lanjutan" })).toBeVisible();
    await shot(5);

    const slug = (await page.getByRole("link", { name: "Buka event" }).getAttribute("href"))
      ?.split("/")
      .pop();
    const copyId = (await page.getByRole("link", { name: "Edit desain" }).getAttribute("href"))
      ?.split("/")
      .pop();
    const { data: ev } = await db
      .from("events")
      .select("name, location, mode, all_devices, bundle, bundle_version, settings")
      .eq("organization_id", u.org)
      .eq("slug", slug ?? "")
      .single();
    expect(ev).toMatchObject({
      name,
      location: "Gedung Sate",
      mode: "event",
      all_devices: true,
      bundle_version: 2,
      settings: { template: { preset: "strip-3", extras: [`tpl:${copyId}`] } },
    });
    const config = (ev?.bundle as { config: Record<string, unknown> } | undefined)?.config ?? {};
    expect(config).toMatchObject({
      name,
      tagline: "The Wedding of",
      layout: { paper: "2x6x2" },
    });
    expect((config.designs as { name: string }[]).map((d) => d.name)).toEqual([
      "Strip Klasik",
      `${name} · Strip 4 Foto`,
    ]);
  } finally {
    const { data: copies } = await db.from("layouts").select("id").like("name", `${name}%`);
    await db.from("events").delete().eq("name", name);
    for (const c of copies ?? []) {
      await db.from("layout_versions").delete().eq("layout_id", c.id);
      await db.from("layouts").delete().eq("id", c.id);
    }
    await u.cleanup();
  }
});

test("URL event = slug nama + tanggal; UUID lama dialihkan; nama + tanggal sama → slug beda", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const stamp = Date.now();
  const name = `E2E Slug Café ${stamp}`;
  const slug = `e2e-slug-cafe-${stamp}-2026-10-12`;
  try {
    await login(page, u);
    expect(
      await createEventViaWizard(page, { name, paper: /Strip 2R/, designs: ["Strip Klasik"] }),
    ).toBe(slug);
    await page.getByRole("link", { name: "Buka event" }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/events/${slug}$`));
    await expect(page.getByRole("heading", { name })).toBeVisible();

    // Link/bookmark lama berbasis UUID tetap jalan: dialihkan ke URL slug.
    const { data: ev } = await db.from("events").select("id").eq("slug", slug).single();
    await page.goto(`/admin/events/${ev?.id}/settings`);
    await expect(page).toHaveURL(new RegExp(`/admin/events/${slug}/settings$`));
    await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();

    // Nama + tanggal sama dalam satu organisasi → akhiran -2.
    const { data: twin } = await db
      .from("events")
      .insert({ organization_id: u.org, name, mode: "event", event_date: "2026-10-12" })
      .select("slug")
      .single();
    expect(twin?.slug).toBe(`${slug}-2`);
    await page.goto("/admin");
    await expect(page.locator(`a[href="/admin/events/${slug}-2"]`)).toBeVisible();
  } finally {
    await db.from("events").delete().eq("name", name);
    await u.cleanup();
  }
});

test("wizard photobox: layout + harga di langkah 3, bundle photobox", async ({ page }) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const name = `e2e wizard pb ${Date.now()}`;
  const next = page.getByRole("button", { name: /^Lanjut/ });
  try {
    await login(page, u);
    await page.goto("/admin/events/new");
    await page.getByLabel("Nama event").fill(name);
    await page.getByLabel("Tanggal event").fill("2026-10-12");
    await next.click();
    await page.getByRole("radio", { name: /^Photobox/ }).check();
    await next.click();
    await next.click();
    await expect(page.getByText("Centang minimal satu layout yang dijual.")).toBeVisible();
    await page.getByRole("checkbox", { name: "Jual 4R Grid" }).check();
    await page.getByLabel("Harga 4R Grid").fill("1000");
    await next.click();
    await expect(page.getByText("Harga tiap layout minimal Rp 1.500.")).toBeVisible();
    await page.getByLabel("Harga 4R Grid").fill("35000");
    await page.getByRole("checkbox", { name: "Jual Strip Klasik" }).check();
    await page.screenshot({ path: "test-results/wizard-3-photobox.png", fullPage: true });
    await next.click();
    await next.click();
    await expect(page.getByText("Rp 35.000")).toBeVisible();
    await page.getByRole("button", { name: "Buat event" }).click();
    await expect(page.getByRole("link", { name: "Buka event" })).toBeVisible({ timeout: 30_000 });
    const { data: ev } = await db
      .from("events")
      .select("mode, all_devices, bundle")
      .eq("name", name)
      .single();
    expect(ev).toMatchObject({ mode: "photobox", all_devices: true });
    type Pb = {
      mode: string;
      photobox: { extraPrintPrice: number; layouts: { id: string; price: number }[] };
    };
    const config = (ev?.bundle as { config: Pb } | undefined)?.config;
    expect(config?.mode).toBe("photobox");
    expect(config?.photobox.extraPrintPrice).toBe(10000);
    expect(config?.photobox.layouts.map((l) => [l.id, l.price])).toEqual([
      ["strip-3", 25000],
      ["4r-grid", 35000],
    ]);
  } finally {
    await db.from("events").delete().eq("name", name);
    await u.cleanup();
  }
});
