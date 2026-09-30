import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

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
    await page.getByRole("button", { name: "+ Buat Event" }).click();
    await page.getByPlaceholder(/Nama event/).fill(name);
    await page.getByLabel("Tanggal event").fill("2026-10-12");
    await page.getByRole("button", { name: "Buat", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();
    // Navigasi cepat antarbagian (audit UX 30 Sep).
    await expect(page.getByRole("navigation", { name: "Bagian pengaturan" })).toBeVisible();
    await page.screenshot({ path: "test-results/admin-settings-top.png" });

    await page.getByLabel(/Teks kecil di layar booth/).fill("The Wedding of");
    // Desain frame: 1–3 desain dengan kertas sama. Event baru = Strip Klasik (2R), jadi 4R terkunci dulu.
    const frames = page.getByRole("group", { name: "Desain frame" });
    const grid = frames.getByRole("checkbox", { name: /^4R Grid/ });
    await expect(grid).toBeDisabled();
    await expect(frames).toContainText("Ukuran harus sama: 2R 2x6");
    await frames.getByRole("checkbox", { name: /^Strip Klasik/ }).uncheck({ force: true });
    await grid.check({ force: true });
    await frames.getByRole("checkbox", { name: /^4R Single/ }).check({ force: true });
    await expect(frames.getByRole("checkbox", { name: /^Strip Klasik/ })).toBeDisabled();
    await expect(frames.getByText("Utama", { exact: true })).toBeVisible();
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
    await page.getByLabel(dev?.name ?? "").check();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v2", {
      timeout: 30_000,
    });
    await page.waitForLoadState("networkidle"); // refresh RSC setelah simpan selesai dulu
    await page.screenshot({ path: "test-results/admin-settings.png", fullPage: true });

    const auth = { Authorization: `Bearer ${token}` };
    const { events } = await (await request.get("/api/booth/events", { headers: auth })).json();
    const ev = events.find((e: { name: string }) => e.name === name);
    expect(ev?.bundleVersion).toBe(2);
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
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v4", {
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
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("isi teks persetujuan", {
      timeout: 30_000,
    });
    await page.getByLabel(/Teks persetujuan/).fill("Saya setuju data saya dipakai untuk promo.");
    await page.getByLabel("Wajib: foto tampil setelah form diisi").check();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v5", {
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

    await page.goto("/admin");
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
