import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { createEventViaWizard, db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * Paket event (#150): isi manual di wizard → tersimpan & tampil di Pengaturan; "Ambil dari Tetra Ops" dengan stub
 * Tetra Ops lokal (TETRA_OPS_URL di playwright.config.ts) mengisi nama, tanggal, lokasi, kertas, paket.
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 1440, height: 900 } });

test("wizard: paket manual tersimpan dan tampil di Pengaturan", async ({ page }) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const name = `e2e paket ${Date.now()}`;
  try {
    await login(page, u);
    const slug = await createEventViaWizard(page, {
      name,
      paper: /Strip 2R/,
      designs: ["Strip Klasik"],
      pkg: { name: "Paket Uji 3 Jam", hours: "3.5" },
    });
    const { data: ev } = await db
      .from("events")
      .select("package_name, package_hours, ops_project_id")
      .eq("slug", slug)
      .single();
    expect(ev).toEqual({
      package_name: "Paket Uji 3 Jam",
      package_hours: 3.5,
      ops_project_id: null,
    });
    await page.goto(`/admin/events/${slug}/settings`);
    await expect(page.getByLabel(/^Paket/)).toHaveValue("Paket Uji 3 Jam");
    await expect(page.getByLabel(/^Durasi paket/)).toHaveValue("3.5");
  } finally {
    await db.from("events").delete().eq("name", name);
    await u.cleanup();
  }
});

const BOOKINGS = [
  {
    project_id: "PRJ-E2E-0001",
    client_name: "Vina & Aji",
    event_title: null,
    event_category: "wedding",
    event_category_label: "Wedding",
    event_date: "2026-10-18",
    start_time: "11:00",
    end_time: "15:00",
    venue_name: "PPMKP Ciawi",
    venue_city: "Bogor",
    service_type: "photobooth_classic",
    frame_size: "2R",
    package_name: "2R Unlimited 4 Jam",
    package_duration_hours: 4,
  },
  {
    project_id: "PRJ-E2E-0002",
    client_name: "Karina",
    event_title: "Karina's Sweet Seventeen",
    event_category: "birthday",
    event_category_label: "Birthday",
    event_date: "2026-10-19",
    start_time: null,
    end_time: null,
    venue_name: null,
    venue_city: "Bogor",
    service_type: "photobooth_classic",
    frame_size: "none",
    package_name: null,
    package_duration_hours: null,
  },
  {
    project_id: "PRJ-E2E-0003",
    client_name: "PT Uji",
    event_title: "Gathering PT Uji",
    event_category: "corporate",
    event_category_label: "Corporate",
    event_date: "2026-11-07",
    start_time: "09:00",
    end_time: "12:00",
    venue_name: "Hotel Uji",
    venue_city: "Jakarta",
    service_type: "photobooth_classic",
    frame_size: "4R",
    package_name: "4R Unlimited 3 Jam",
    package_duration_hours: 3,
  },
];

test("wizard: Ambil dari Tetra Ops mengisi event dan menyimpan project_id", async ({ page }) => {
  test.setTimeout(90_000);
  const auths: string[] = [];
  const urls: string[] = [];
  const server: Server = createServer((req, res) => {
    auths.push(req.headers.authorization ?? "");
    urls.push(req.url ?? "");
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/api/booth/bookings"))
      return res.end(JSON.stringify({ bookings: BOOKINGS }));
    if (req.url?.startsWith("/api/booth/packages"))
      return res.end(
        JSON.stringify({
          packages: [
            { name: "4R Unlimited 3 Jam", category: "x", frame_size: "4R", duration_hours: 3 },
          ],
        }),
      );
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(4019, "127.0.0.1", r));
  const u = await makeUser("owner");
  const tag = String(Date.now()).slice(-6);
  try {
    await login(page, u);
    await page.goto("/admin/events/new");
    const list = page.getByTestId("ops-list");
    // Filter bulan (#152): bawaan bulan ini; booking diambil sekali untuk 180 hari (batas Tetra Ops).
    const months = page.getByTestId("ops-months");
    await expect(months.getByRole("button", { name: /^Okt/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(list.getByRole("button")).toHaveCount(2);
    await page.screenshot({ path: "test-results/wizard-ops.png" });
    const q = new URL(`http://x${urls.find((x) => x.startsWith("/api/booth/bookings")) ?? ""}`)
      .searchParams;
    expect((Date.parse(q.get("to") ?? "") - Date.parse(q.get("from") ?? "")) / 86_400_000).toBe(
      179,
    );
    await months.getByRole("button", { name: /^Nov/ }).click();
    await expect(list.getByRole("button")).toHaveCount(1);
    await expect(list).toContainText("Gathering PT Uji");
    await page.screenshot({ path: "test-results/wizard-ops-month.png" });
    await months.getByRole("button", { name: /^Semua/ }).click();
    await expect(list.getByRole("button")).toHaveCount(3);
    await months.getByRole("button", { name: /^Okt/ }).click();
    expect(auths.every((a) => a === "Bearer e2e-ops-token")).toBe(true);
    await page.getByPlaceholder("Cari klien, lokasi, paket").fill("ciawi");
    await expect(list.getByRole("button")).toHaveCount(1);
    await list.getByRole("button", { name: /Wedding Vina & Aji/ }).click();
    await expect(page.getByTestId("ops-picked")).toContainText("PRJ-E2E-0001");
    await expect(page.getByLabel("Nama event")).toHaveValue("Wedding Vina & Aji");
    await expect(page.getByLabel("Tanggal event")).toHaveValue("2026-10-18");
    await expect(page.getByLabel(/^Lokasi/)).toHaveValue("PPMKP Ciawi, Bogor");
    await expect(page.getByLabel("Nama paket")).toHaveValue("2R Unlimited 4 Jam");
    await expect(page.getByLabel("Durasi (jam)")).toHaveValue("4");
    await expect(page.getByLabel("Jadwal mulai")).toHaveValue("11:00");
    await expect(page.getByLabel("Jadwal selesai")).toHaveValue("15:00");
    // Select paket menampilkan paket booking (tidak ada di daftar paket Ops = opsi "dari booking", #162).
    await expect(page.getByRole("combobox", { name: "Pilih paket Tetra Ops" })).toContainText(
      "2R Unlimited 4 Jam",
    );
    await page.screenshot({ path: "test-results/wizard-ops-picked.png", fullPage: true });
    // Paket dari daftar Tetra Ops menimpa isian paket.
    await page.getByRole("combobox", { name: "Pilih paket Tetra Ops" }).click();
    await page.getByRole("option", { name: /4R Unlimited 3 Jam/ }).click();
    await expect(page.getByLabel("Nama paket")).toHaveValue("4R Unlimited 3 Jam");
    await expect(page.getByLabel("Durasi (jam)")).toHaveValue("3");
    await expect(page.getByRole("combobox", { name: "Pilih paket Tetra Ops" })).toContainText(
      "4R Unlimited 3 Jam",
    );
    await page.getByLabel("Nama event").fill(`e2e ops ${tag}`);

    // Mode Event + kertas Strip 2R sudah terpilih dari booking.
    await page.getByRole("button", { name: /^Lanjut/ }).click();
    await expect(page.getByRole("radio", { name: /^Event/ })).toBeChecked();
    await page.getByRole("button", { name: /^Lanjut/ }).click();
    await expect(page.getByRole("radio", { name: /Strip 2R/ })).toBeChecked();
    // Kertas beda dari booking Ops = peringatan (tidak memblokir, #162).
    const warn = page.getByText(
      "Tetra Ops mencatat ukuran 2R untuk booking ini. Yakin pakai Foto 4R?",
    );
    await expect(warn).toBeHidden();
    await page.getByRole("radio", { name: /Foto 4R/ }).check();
    await expect(warn).toBeVisible();
    await page.screenshot({ path: "test-results/wizard-ops-paper-warning.png" });
    await page.getByRole("radio", { name: /Strip 2R/ }).check();
    await expect(warn).toBeHidden();
    const picker = page.getByRole("dialog", { name: "Tambah desain frame" });
    await page.getByRole("button", { name: /Tambah desain/ }).click();
    await picker.getByRole("textbox", { name: "Cari nama desain" }).fill("Strip Klasik");
    await picker
      .getByRole("button", { name: /^Strip Klasik/ })
      .first()
      .click();
    await picker.getByRole("button", { name: "Pakai desain ini" }).click();
    await page.getByRole("button", { name: /^Lanjut/ }).click();
    await page.getByRole("button", { name: /^Lanjut/ }).click();
    await expect(page.getByText("Dari Tetra Ops · PRJ-E2E-0001")).toBeVisible();
    await page.getByRole("button", { name: "Buat event" }).click();
    await expect(page.getByRole("link", { name: "Buka event" })).toBeVisible({ timeout: 30_000 });
    const { data: ev } = await db
      .from("events")
      .select(
        "slug, package_name, package_hours, ops_project_id, ops_frame_size, location, event_date, branding, scheduled_start, scheduled_end",
      )
      .eq("name", `e2e ops ${tag}`)
      .single();
    expect(ev).toMatchObject({
      package_name: "4R Unlimited 3 Jam",
      package_hours: 3,
      ops_project_id: "PRJ-E2E-0001",
      ops_frame_size: "2R",
      location: "PPMKP Ciawi, Bogor",
      event_date: "2026-10-18",
      branding: { clientName: "Vina & Aji" },
      scheduled_start: "11:00:00",
      scheduled_end: "15:00:00",
    });
    // Pengaturan: desain 2R sesuai booking = tanpa peringatan; Ops mencatat 4R = peringatan.
    await page.goto(`/admin/events/${ev?.slug}/settings`);
    await expect(page.getByText(/Tetra Ops mencatat ukuran/)).toBeHidden();
    await db
      .from("events")
      .update({ ops_frame_size: "4R" })
      .eq("slug", ev?.slug ?? "");
    await page.reload();
    await expect(
      page.getByText("Tetra Ops mencatat ukuran 4R untuk booking ini. Yakin pakai Strip 2R?"),
    ).toBeVisible();
  } finally {
    server.close();
    await db.from("events").delete().eq("name", `e2e ops ${tag}`);
    await u.cleanup();
  }
});
