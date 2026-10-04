import { createHash, randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Timer event (#149) dari admin & API booth + kartu Rekap event (#148): statistik, durasi vs paket. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 1440, height: 900 } });

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("timer admin: mulai, jeda, lanjut, selesai, ubah jam → rekap lebih 20 menit", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const u = await makeUser("owner");
  const tag = String(Date.now()).slice(-6).replace(/[01]/g, "4");
  const ids: [string, string, string] = [`rka${tag}a`, `rkb${tag}a`, `rkc${tag}a`];
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e rekap ${tag}`,
      mode: "event",
      event_date: "2026-10-12",
      location: "Gedung Kirana",
      package_name: "2R Unlimited 1 Jam",
      package_hours: 1,
      scheduled_start: "10:00",
      scheduled_end: "11:00",
    })
    .select("id, slug")
    .single();
  const eventId = ev?.id ?? "";
  const device = (
    await db.from("devices").select("id, name").eq("organization_id", u.org).limit(1).single()
  ).data;
  try {
    await db.from("sessions").insert(
      ids.map((id, i) => ({
        id,
        organization_id: u.org,
        event_id: eventId,
        device_id: device?.id ?? "",
        started_at: `2026-10-12T0${3 + i}:05:00Z`,
        print_count: i === 0 ? 4 : 2,
        upload_status: "complete",
      })),
    );
    // Sesi tes crew (#153): tidak ikut dihitung di rekap.
    await db.from("sessions").insert({
      id: `rkt${tag}a`,
      organization_id: u.org,
      event_id: eventId,
      device_id: device?.id ?? "",
      started_at: "2026-10-12T02:30:00Z",
      print_count: 5,
      upload_status: "complete",
      is_test: true,
    });
    await db.from("assets").insert(
      ids.flatMap((sid) =>
        [1, 2].map((idx) => ({
          organization_id: u.org,
          session_id: sid,
          kind: "original",
          idx,
          r2_key: `${R2}/original_${idx}.jpg#${sid}`,
        })),
      ),
    );
    await db.from("analytics_events").insert([
      { organization_id: u.org, event_id: eventId, session_id: ids[0], type: "qr_open" },
      { organization_id: u.org, event_id: eventId, session_id: ids[1], type: "qr_open" },
      { organization_id: u.org, event_id: eventId, session_id: ids[0], type: "save" },
    ]);
    await db.from("leads").insert({
      organization_id: u.org,
      event_id: eventId,
      session_id: ids[0],
      data: { name: "Tamu" },
      consent_version: "v1",
      consent_at: new Date().toISOString(),
    });

    await login(page, u);
    await page.goto(`/admin/events/${ev?.slug}`);
    const panel = page.getByTestId("run-panel");
    await expect(panel).toHaveAttribute("data-state", "idle");
    await panel.getByRole("button", { name: "Mulai event" }).click();
    await expect(panel).toHaveAttribute("data-state", "running");
    await expect(page.getByTestId("run-state")).toHaveText("Berjalan");
    await panel.getByRole("button", { name: "Jeda" }).click();
    await expect(panel).toHaveAttribute("data-state", "paused");
    await panel.getByRole("button", { name: "Lanjutkan" }).click();
    await expect(panel).toHaveAttribute("data-state", "running");
    await page.screenshot({ path: "test-results/run-panel.png" });
    await panel.getByRole("button", { name: "Selesai" }).click();
    await expect(panel).toContainText("Event sudah selesai?");
    await panel.getByRole("button", { name: "Ya, selesai" }).click();
    await expect(panel).toHaveAttribute("data-state", "finished");
    const after = (await db.from("events").select("run").eq("id", eventId).single()).data?.run as {
      segments: { start: string; end?: string }[];
      finishedAt?: string;
    };
    expect(after.segments).toHaveLength(2);
    expect(after.finishedAt).toBeTruthy();

    // Koreksi manual: mulai 78 menit sebelum menit klik pertama, selesai 80 menit setelahnya (jeda di tengah
    // hanya beberapa detik) → ±80 menit berjalan vs paket 60 menit.
    await panel.getByRole("button", { name: "Ubah jam" }).click();
    const s0 = Date.parse(after.segments[0]?.start ?? "");
    const local = (ms: number) =>
      new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    const start = Math.floor(s0 / 60_000) * 60_000 - 78 * 60_000;
    await panel.getByLabel("Mulai").fill(local(start));
    await panel.getByLabel(/^Selesai/).fill(local(start + 80 * 60_000));
    await panel.getByRole("button", { name: "Simpan jam" }).click();
    await expect(panel.getByRole("button", { name: "Simpan jam" })).toHaveCount(0);
    await page.screenshot({ path: "test-results/run-panel-finished.png" });

    await page.getByRole("button", { name: "Rekap event" }).click();
    const card = page.getByTestId("recap-card");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("recap-verdict")).toHaveAttribute("data-kind", "over");
    await expect(page.getByTestId("recap-verdict")).toContainText("Lebih 20 menit");
    await expect(page.getByTestId("recap-Sesi")).toHaveText("3");
    await expect(page.getByTestId("recap-Lembar dicetak")).toHaveText("8");
    await expect(page.getByTestId("recap-QR dibuka")).toHaveText("67%");
    await expect(page.getByTestId("recap-Disimpan ke HP")).toHaveText("33%");
    await expect(page.getByTestId("recap-Data tamu")).toHaveText("1");
    await expect(page.getByTestId("recap-Foto terunggah")).toHaveText("6");
    await expect(page.getByTestId("recap-Sesi pertama")).toHaveText("10.05");
    await expect(page.getByTestId("recap-Sesi terakhir")).toHaveText("12.05");
    await expect(page.getByTestId("recap-row-Paket")).toHaveText("2R Unlimited 1 Jam · 1 jam");
    // Jadwal vs nyata (#152): jam nyata = timer yang dikoreksi.
    await expect(page.getByTestId("recap-schedule")).toContainText(
      /Jadwal 10\.00–11\.00 vs Nyata \d{2}\.\d{2}–\d{2}\.\d{2}/,
    );
    await expect(page.getByTestId("recap-schedule")).toContainText(
      /Mulai (telat|lebih awal|tepat)/,
    );
    if (device) await expect(page.getByTestId("recap-row-Booth")).toHaveText(device.name);
    // Muat tanpa scroll di laptop 1440×900.
    const box = await page.getByRole("dialog", { name: "Rekap event" }).boundingBox();
    expect(box && box.y >= 0 && box.y + box.height <= 900).toBe(true);
    await card.screenshot({ path: "test-results/recap-card.png" });
    await page.screenshot({ path: "test-results/recap-dialog.png" });

    await page.getByRole("button", { name: "Salin teks" }).click();
    await expect(page.getByRole("button", { name: "Teks tersalin" })).toBeVisible();
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain(`*Rekap Event · e2e rekap ${tag}*`);
    expect(text).toContain("*Lebih 20 menit*");
    expect(text).toContain("Sesi: 3");
    expect(text).toContain("Jadwal 10.00–11.00 · Nyata");

    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Unduh gambar" }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe(`rekap-${ev?.slug}.png`);
    await file.saveAs("test-results/recap.png");
    const png = readFileSync("test-results/recap.png");
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(1200); // lebar 600 × 2
  } finally {
    await db.from("audit_logs").delete().eq("target", eventId);
    await db.from("events").delete().eq("id", eventId);
    await u.cleanup();
  }
});

test("API booth: buka, ulang (idempotent), jeda offline terlambat, selesai", async ({
  request,
}) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const token = randomBytes(32).toString("base64url");
  const tag = String(Date.now()).slice(-6);
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: org,
      name: `e2e run ${tag}`,
      short_code: `E2R-${tag}`,
      token_hash: createHash("sha256").update(token).digest("hex"),
    })
    .select("id")
    .single();
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: `e2e run ${tag}`,
      mode: "event",
      event_date: "2026-10-12",
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  const auth = { Authorization: `Bearer ${token}` };
  const send = (action: string, at: string, id: string = randomUUID()) =>
    request.post(`/api/booth/events/${eventId}/run`, { headers: auth, data: { id, action, at } });
  try {
    expect(
      (
        await request.post(`/api/booth/events/${eventId}/run`, {
          data: { id: randomUUID(), action: "open", at: new Date().toISOString() },
        })
      ).status(),
    ).toBe(401);
    expect((await send("lompat", new Date().toISOString())).status()).toBe(400);

    const t0 = Date.now() - 3 * 3_600_000;
    const at = (min: number) => new Date(t0 + min * 60_000).toISOString();
    const openId = randomUUID();
    const r1 = await send("open", at(0), openId);
    expect(r1.status()).toBe(200);
    expect(await r1.json()).toEqual({ state: "running" });
    // Kirim ulang aksi yang sama (antrean booth retry) = tidak berubah.
    expect(await (await send("open", at(0), openId)).json()).toEqual({ state: "running" });
    expect(await (await send("pause", at(60))).json()).toEqual({ state: "paused" });
    // Buka untuk Tamu 15 menit kemudian (jam booth), lalu selesai.
    expect(await (await send("open", at(75))).json()).toEqual({ state: "running" });
    expect(await (await send("finish", at(135))).json()).toEqual({ state: "finished" });
    // Buka untuk Tamu setelah selesai tidak membuka lagi.
    expect(await (await send("open", at(140))).json()).toEqual({ state: "finished" });

    // Salin Link Galeri dari rekap booth (#155): link klien aktif, idempotent (token tidak berganti).
    const link = () =>
      request.post(`/api/booth/events/${eventId}/gallery-link`, { headers: auth, data: {} });
    expect((await request.post(`/api/booth/events/${eventId}/gallery-link`)).status()).toBe(401);
    const l1 = await link();
    expect(l1.status()).toBe(200);
    const { slug } = await l1.json();
    expect(slug).toMatch(/^e2e-run-\d+-2026-10-12$/);
    const tok1 = (await db.from("events").select("client_token").eq("id", eventId).single()).data
      ?.client_token;
    expect(tok1).toBeTruthy();
    expect((await (await link()).json()).slug).toBe(slug);
    expect(
      (await db.from("events").select("client_token").eq("id", eventId).single()).data
        ?.client_token,
    ).toBe(tok1);

    const run = (await db.from("events").select("run").eq("id", eventId).single()).data?.run as {
      segments: { start: string; end?: string }[];
      finishedAt?: string;
    };
    expect(run.segments).toEqual([
      { start: at(0), end: at(60) },
      { start: at(75), end: at(135) },
    ]);
    expect(run.finishedAt).toBe(at(135));
  } finally {
    await db.from("audit_logs").delete().eq("target", eventId);
    await db.from("events").delete().eq("id", eventId);
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
  }
});
