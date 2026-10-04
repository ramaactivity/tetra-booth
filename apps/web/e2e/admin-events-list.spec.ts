import { expect, test } from "@playwright/test";
import { newAccessToken } from "@tetra/shared";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * Daftar Event & Photobox (#156): kolom per mode, filter lewat URL, ringkasan bulan ini. Sesi tes crew (#153):
 * tidak dihitung di daftar, dashboard, galeri klien, slideshow; tetap tampil di admin dengan tanda "Tes".
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 1440, height: 900 } });

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("daftar event & photobox, filter URL, sesi tes tidak dihitung", async ({ page }) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const tag = String(Date.now()).slice(-6).replace(/[01]/g, "7");
  const name = `e2e daftar ${tag}`;
  const pbName = `e2e kios ${tag}`;
  const device = (
    await db.from("devices").select("id, name").eq("organization_id", u.org).limit(1).single()
  ).data;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name,
      mode: "event",
      event_date: "2026-10-20",
      location: "Gedung Kirana",
      branding: { clientName: "Keluarga Uji" },
      package_name: "Paket 3 Jam",
      package_hours: 3,
      scheduled_start: "08:00",
      scheduled_end: "11:00",
      client_token: newAccessToken(),
      live_token: newAccessToken(),
      client_expires_at: "2099-01-01T00:00:00Z",
      local_bytes: 2 * 1024 ** 3,
      local_files: 300,
    })
    .select("id, slug")
    .single();
  const { data: pb } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: pbName,
      mode: "photobox",
      event_date: "2026-10-21",
      settings: {
        photobox: {
          layouts: [
            { preset: "strip-3", price: 25000 },
            { preset: "4r-single", price: 35000 },
          ],
          extraPrintPrice: 10000,
        },
      },
    })
    .select("id, slug")
    .single();
  const eventId = ev?.id ?? "";
  const ids = [`dla${tag}a`, `dlb${tag}a`, `dlt${tag}a`];
  try {
    const { error } = await db.from("sessions").insert([
      ...ids.map((id, i) => ({
        id,
        organization_id: u.org,
        event_id: eventId,
        device_id: device?.id ?? "",
        started_at: `2026-10-20T0${2 + i}:10:00Z`,
        print_count: [2, 3, 4][i] ?? 0,
        upload_status: "complete",
        is_test: i === 2,
      })),
      {
        id: `dlp${tag}a`,
        organization_id: u.org,
        event_id: pb?.id ?? "",
        device_id: device?.id ?? "",
        started_at: "2026-10-21T03:00:00Z",
        print_count: 1,
        upload_status: "complete",
        // Insert massal: kolom yang tidak diisi jadi null, bukan default.
        is_test: false,
      },
    ]);
    expect(error).toBeNull();
    await db.from("assets").insert(
      ids.flatMap((sid) =>
        (["strip_web", "thumb_strip"] as const).map((kind) => ({
          organization_id: u.org,
          session_id: sid,
          kind,
          idx: 0,
          r2_key: `${R2}/${kind}_0.jpg#${sid}`,
        })),
      ),
    );
    await db.from("payments").insert({
      organization_id: u.org,
      event_id: pb?.id ?? "",
      device_id: device?.id ?? "",
      prints: 1,
      amount_idr: 25000,
      status: "paid",
      provider: "fake",
      layout_key: "strip-3",
      expires_at: "2026-10-21T03:15:00Z",
      paid_at: "2026-10-21T03:01:00Z",
    });

    await login(page, u);
    // Daftar Event: ringkasan + semua event (screenshot untuk review desain).
    await expect(page.getByRole("heading", { name: "Event", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Event", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(page.getByTestId("list-stat-Sesi bulan ini")).toBeVisible();
    await page.screenshot({ path: "test-results/admin-events-list.png" });

    // Cari lewat kotak cari → URL ikut berubah (bisa dibagikan).
    await page.getByPlaceholder("Cari nama, lokasi, atau klien").fill(`daftar ${tag}`);
    await expect(page).toHaveURL(new RegExp(`\\?q=daftar\\+${tag}`));
    const rows = page.getByTestId("event-row");
    await expect(rows).toHaveCount(1);
    const row = rows.first();
    await expect(row).toContainText(name);
    await expect(row).toContainText("Gedung Kirana · Keluarga Uji");
    await expect(row).toContainText("08.00–11.00");
    await expect(row).toContainText("Paket 3 Jam · 3 jam");
    // Sesi tes tidak dihitung: 2 sesi, 5 lembar.
    await expect(row.getByTestId("event-row-sessions")).toHaveText(/^2/);
    await expect(row.getByTestId("event-row-prints")).toHaveText(/^5/);
    await page.screenshot({ path: "test-results/admin-events-list-filtered.png" });
    // Pencarian klien juga cocok; photobox tidak tampil di daftar Event.
    await page.goto(`/admin?q=${encodeURIComponent(`keluarga uji`)}&bulan=2026-10`);
    await expect(page.getByTestId("event-row").filter({ hasText: name })).toHaveCount(1);
    // Rata-rata ukuran folder event di laptop (#166) atas event yang cocok filter.
    await expect(page.getByTestId("list-stat-Rata-rata ukuran per event")).toHaveText("2 GB");
    await page.goto(`/admin?q=${encodeURIComponent(pbName)}`);
    await expect(page.getByTestId("event-row")).toHaveCount(0);
    await expect(page.getByText("Tidak ada event yang cocok dengan filter ini.")).toBeVisible();
    // Filter bulan & status lewat URL.
    await page.goto(`/admin?q=${encodeURIComponent(name)}&bulan=2026-11`);
    await expect(page.getByTestId("event-row")).toHaveCount(0);
    await page.goto(`/admin?q=${encodeURIComponent(name)}&tab=selesai`);
    await expect(page.getByTestId("event-row")).toHaveCount(0);
    await page.goto(`/admin?q=${encodeURIComponent(name)}`);
    await page.getByRole("link", { name: "Mendatang", exact: true }).click();
    await expect(page).toHaveURL(/tab=mendatang/);
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByTestId("event-row")).toHaveCount(1);
    // Bulan lewat dropdown Tetra (bukan select bawaan).
    await page.getByRole("combobox", { name: "Bulan" }).click();
    await page.getByRole("option", { name: "Oktober 2026" }).click();
    await expect(page).toHaveURL(/bulan=2026-10/);
    await expect(page.getByTestId("event-row")).toHaveCount(1);
    await page.getByRole("button", { name: "Hapus filter" }).click();
    await expect(page).toHaveURL(/\/admin\?tab=mendatang$/);

    // Daftar Photobox: kolom harga & transaksi lunas, terpisah dari Event.
    await page.getByRole("link", { name: "Photobox", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/photobox$/);
    await expect(page.getByRole("heading", { name: "Photobox", exact: true })).toBeVisible();
    await expect(page.getByTestId("list-stat-Transaksi lunas bulan ini")).toBeVisible();
    await page.screenshot({ path: "test-results/admin-photobox-list.png" });
    await page.goto(`/admin/photobox?q=${encodeURIComponent(`${tag}`)}`);
    await expect(page.getByTestId("event-row")).toHaveCount(1);
    const pbRow = page.getByTestId("event-row").first();
    await expect(pbRow).toContainText(pbName);
    await expect(pbRow).toContainText("Rp 25.000–35.000");
    await expect(pbRow).toContainText("1 lunas");
    await expect(pbRow).toContainText("Rp 25.000");
    await expect(page.getByRole("link", { name: "Buat Photobox" })).toHaveAttribute(
      "href",
      "/admin/events/new?mode=photobox",
    );
    await page.getByRole("link", { name: "Buat Photobox" }).click();
    await page.getByLabel("Nama event").fill("x");
    await page.getByLabel("Tanggal event").fill("2026-10-30");
    await page.getByRole("button", { name: /^Lanjut/ }).click();
    await expect(page.getByRole("radio", { name: /^Photobox/ })).toBeChecked();

    // Dashboard event: sesi tes tampil bertanda, tidak dihitung; "Bukan tes" menghitungnya lagi.
    page.on("dialog", (d) => void d.accept());
    await page.goto(`/admin/events/${ev?.slug}`);
    await expect(page.getByTestId("stat-Total sesi")).toHaveText(/^2/);
    await expect(page.getByTestId("stat-Lembar dicetak")).toHaveText(/^5/);
    await expect(page.getByTestId("session-tile")).toHaveCount(3);
    await expect(page.getByTestId("session-test")).toHaveCount(1);
    await expect(page.getByText("1 sesi tes tidak dihitung")).toBeVisible();

    // Galeri klien & slideshow: tanpa sesi tes.
    await page.goto(`/g/${ev?.slug}`);
    await expect(page.getByTestId("gallery-photo")).toHaveCount(2);
    const live = await page.request.get(`/api/live/${ev?.slug}`);
    expect(((await live.json()) as { id: string }[]).map((s) => s.id).sort()).toEqual(
      ids.slice(0, 2).sort(),
    );

    await page.goto(`/admin/events/${ev?.slug}`);
    await page.getByRole("button", { name: "Bukan tes, hitung sesi ini" }).click();
    await expect(page.getByTestId("stat-Total sesi")).toHaveText(/^3/);
    await expect(page.getByTestId("session-test")).toHaveCount(0);
  } finally {
    await db
      .from("payments")
      .delete()
      .eq("event_id", pb?.id ?? "");
    await db
      .from("audit_logs")
      .delete()
      .eq("target", ids[2] ?? "");
    await db
      .from("events")
      .delete()
      .in("id", [eventId, pb?.id ?? ""]);
    await u.cleanup();
  }
});
