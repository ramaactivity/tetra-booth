import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * Acara multi-unit (#262): booking Ops 2 unit (unit 1 4R, unit 2 2R) → dashboard event unit 1 menampilkan kartu
 * "Acara ini pakai 2 unit booth" → "Buat event Unit 2" membuat event kedua dengan nama sama, kertas 2R, nomor unit
 * di ops_sync, Snapbook mati, terkunci ke laptop pilihan. Stub Tetra Ops lokal (TETRA_OPS_URL, port 4019).
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 1440, height: 900 } });

test("acara 2 unit: buat event Unit 2 dari dashboard unit 1", async ({ page }) => {
  test.setTimeout(120_000);
  const tag = String(Date.now()).slice(-6);
  const project = `PRJ-E2E-UNIT-${tag}`;
  const name = `e2e CIMB ${tag}`;
  const server: Server = createServer((req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/api/booth/bookings"))
      return res.end(
        JSON.stringify({
          bookings: [
            {
              project_id: project,
              client_name: "CIMB",
              event_title: name,
              event_category: "corporate",
              event_category_label: "Corporate",
              event_date: "2026-10-16",
              start_time: "10:00",
              end_time: "16:00",
              venue_name: "Hall A",
              venue_city: "Jakarta",
              service_type: "photobooth_classic",
              frame_size: "4R",
              package_name: "4R Unlimited",
              package_duration_hours: 4,
              unit_count: 2,
              design: {
                status: "proses",
                frame_size: "4R",
                spots: [{ spot_no: 2, frame_size: "2R" }],
              },
            },
          ],
        }),
      );
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(4019, "127.0.0.1", r));
  const u = await makeUser("owner");
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name,
      mode: "event",
      event_date: "2026-10-16",
      ops_project_id: project,
      ops_frame_size: "4R",
      settings: { guestCam: { enabled: true } },
    })
    .select("id, slug")
    .single();
  const device =
    (await db.from("devices").select("id, name").eq("organization_id", u.org).limit(1).single())
      .data;
  try {
    await login(page, u);
    await page.goto(`/admin/events/${ev?.slug}`);
    const card = page.getByTestId("ops-units");
    await expect(card).toContainText("Acara ini pakai 2 unit booth");
    await expect(card).toContainText("1 unit belum dibuat");
    // Ukuran unit 2 terpilih dari Tetra Ops (design.spots).
    await expect(card.getByRole("button", { name: "2R", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if (device) await card.getByRole("button", { name: device.name }).last().click();
    await page.screenshot({ path: "test-results/ops-units-before.png" });
    await card.getByRole("button", { name: "Buat event Unit 2" }).click();
    await expect(card).toContainText("Semua unit sudah siap", { timeout: 30_000 });
    await expect(card.getByRole("link", { name: "Buka event" })).toBeVisible();
    await page.screenshot({ path: "test-results/ops-units-after.png" });

    const { data: all } = await db
      .from("events")
      .select("id, name, ops_sync, ops_frame_size, settings, all_devices, event_devices(device_id)")
      .eq("ops_project_id", project)
      .order("created_at");
    expect(all).toHaveLength(2);
    const [one, two] = all ?? [];
    expect(two?.name).toBe(name);
    expect(two?.ops_sync).toMatchObject({ spot: 2 });
    expect(one?.ops_sync).toMatchObject({ spot: 1 });
    expect(two?.ops_frame_size).toBe("2R");
    expect((two?.settings as { guestCam?: { enabled?: boolean } }).guestCam?.enabled).toBe(false);
    if (device) {
      expect(two?.all_devices).toBe(false);
      expect(two?.event_devices.map((d) => d.device_id)).toEqual([device.id]);
    }
    const { data: lay } = await db
      .from("events")
      .select("paper:bundle->config->layout->paper")
      .eq("id", two?.id ?? "")
      .single();
    expect((lay as { paper?: string } | null)?.paper).toBe("2x6x2");
  } finally {
    server.close();
    await db.from("events").delete().eq("ops_project_id", project);
    await u.cleanup();
  }
});
