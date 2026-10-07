import { createServer, type Server } from "node:http";
import { crc32, deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { createEventViaWizard, db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * "Pasang desain dari Tetra Ops" (#177): stub Tetra Ops (TETRA_OPS_URL di playwright.config.ts) mengirim booking
 * dengan desain ACC + PNG berkotak foto transparan → kartu di dashboard event → dialog UploadDesign → pasang →
 * template baru jadi desain utama dan `ops_sync.design_installed_at` terisi.
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 1440, height: 900 } });

/** PNG RGBA W×H putih dengan satu kotak transparan (kotak foto), tanpa dependensi. */
function framePng(W: number, H: number) {
  const row = 1 + W * 4;
  const raw = Buffer.alloc(row * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const hole = x > W * 0.1 && x < W * 0.9 && y > H * 0.1 && y < H * 0.7;
      raw.fill(hole ? 0 : 255, y * row + 1 + x * 4, y * row + 1 + x * 4 + 4);
    }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("dashboard event: desain ACC dari Tetra Ops dipasang sebagai desain utama", async ({ page }) => {
  test.setTimeout(120_000);
  const name = `e2e ops design ${Date.now()}`;
  const png = framePng(1200, 1800);
  const booking = {
    project_id: "PRJ-E2E-DESIGN",
    client_name: "Rina",
    event_category: "wedding",
    event_date: "2026-12-20",
    start_time: null,
    end_time: null,
    venue_name: null,
    venue_city: null,
    service_type: "photobooth_classic",
    frame_size: "4R",
    package_name: null,
    package_duration_hours: null,
    design: {
      status: "approved",
      stage: "acc",
      approved_at: "2026-11-02T09:14:00+07:00",
      frame_size: "4R",
      orientation: "portrait",
      frame_url: "http://127.0.0.1:4019/frame.png?token=x",
    },
  };
  const server: Server = createServer((req, res) => {
    if (req.url?.startsWith("/frame.png")) {
      res.setHeader("content-type", "image/png");
      return res.end(png);
    }
    res.setHeader("content-type", "application/json");
    if (req.url?.startsWith("/api/booth/bookings"))
      return res.end(JSON.stringify({ bookings: [booking] }));
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((r) => server.listen(4019, "127.0.0.1", r));
  const u = await makeUser("owner");
  try {
    await login(page, u);
    const slug = await createEventViaWizard(page, {
      name,
      date: "2026-12-20",
      paper: /Foto 4R/,
      design: "auto",
    });
    await db.from("events").update({ ops_project_id: "PRJ-E2E-DESIGN" }).eq("slug", slug);
    await page.goto(`/admin/events/${slug}`);
    await expect(page.getByText("Desain frame sudah di-ACC klien di Tetra Ops")).toBeVisible();
    await page.getByRole("button", { name: "Pasang desain dari Tetra Ops" }).click();
    const dialog = page.getByRole("dialog", { name: "Pasang desain dari Tetra Ops" });
    await expect(dialog.getByRole("img", { name: "Pratinjau slot terdeteksi" })).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({ path: "test-results/ops-design-dialog.png" });
    await dialog.getByRole("button", { name: "Pasang sebagai desain utama" }).click();
    await expect(
      page.getByText("Desain dari Tetra Ops terpasang sebagai desain utama."),
    ).toBeVisible({ timeout: 30_000 });
    await page.screenshot({ path: "test-results/ops-design-installed.png" });
    const { data: ev } = await db
      .from("events")
      .select("settings, ops_sync")
      .eq("slug", slug)
      .single();
    const layoutId = (ev?.settings as { template?: { layoutId?: string } }).template?.layoutId;
    const { data: l } = await db.from("layouts").select("name").eq("id", layoutId ?? "").single();
    expect(l?.name).toBe(`${name} · Desain Tetra Ops`);
    expect((ev?.ops_sync as { design_installed_at?: string }).design_installed_at).toBeTruthy();
  } finally {
    server.close();
    const { data: ev } = await db.from("events").select("id").eq("name", name).maybeSingle();
    if (ev) await db.from("events").delete().eq("id", ev.id);
    await u.cleanup();
  }
});
