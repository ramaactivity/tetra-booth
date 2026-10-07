import { expect, test } from "@playwright/test";
import { createEventViaWizard, db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * Photo Stage S3 (#180): galeri klien bertab Photo Stage (per rombongan + cari nama grup), Original hanya booth,
 * halaman tamu rombongan (nama grup, simpan semua), live slideshow ikut menampilkan foto stage.
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";

test("Photo Stage di galeri klien, halaman tamu, dan live", async ({ browser, request }) => {
  const tag = String(Date.now()).slice(-6).replace(/[01]/g, "5");
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const device =
    (await db.from("devices").select("id").eq("organization_id", org).limit(1).single()).data?.id ??
    "";
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: `e2e stage ${tag}`,
      mode: "event",
      event_date: "2026-12-12",
      client_token: `e2e-stage-client-${tag}`,
      live_token: `e2e-stage-live-${tag}`,
      ops_project_id: `PRJ-E2E-STAGE-${tag}`,
      client_expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  const booth = `skb${tag}a`;
  const inti = `skc${tag}a`;
  const tamu = `skd${tag}a`;
  const kirim = `ske${tag}a`;
  try {
    await db.from("sessions").insert(
      [
        { id: booth, started_at: "2026-12-12T05:00:00Z", source: "booth", group_name: null },
        {
          id: inti,
          started_at: "2026-12-12T05:10:00Z",
          source: "stage",
          group_name: "Keluarga Inti",
        },
        { id: tamu, started_at: "2026-12-12T05:20:00Z", source: "stage", group_name: null },
        {
          id: kirim,
          started_at: "2026-12-12T05:30:00Z",
          source: "stage",
          group_name: "Teman Kantor PT ABC",
          upload_status: "partial",
          asset_count: 8,
        },
      ].map((s) => ({
        ...s,
        organization_id: org,
        event_id: eventId,
        device_id: device,
        upload_status: "complete",
        ...s,
      })),
    );
    const files = (sid: string, booth: boolean) =>
      (booth
        ? ["strip_web_0", "thumb_strip_0", "original_1", "thumb_original_1"]
        : ["original_1", "thumb_original_1", "original_2", "thumb_original_2"]
      ).map((f) => ({
        organization_id: org,
        session_id: sid,
        kind: f.replace(/_\d$/, ""),
        idx: Number(f.slice(-1)),
        r2_key: `${R2}/${f.replace(/_2$/, "_1")}.jpg#${sid}-${f}`,
      }));
    await db
      .from("assets")
      .insert([...files(booth, true), ...files(inti, false), ...files(tamu, false)]);

    const g = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await g.goto(`/g/e2e-stage-client-${tag}`);
    await expect(g.getByRole("button", { name: "Photo Stage" })).toBeVisible();
    // Original = foto booth saja.
    await g.getByRole("button", { name: "Original", exact: true }).click();
    await expect(g.getByTestId("gallery-photo")).toHaveCount(1);
    await g.getByRole("button", { name: "Photo Stage" }).click();
    await expect(g.getByRole("heading", { name: "Keluarga Inti" })).toBeVisible();
    await expect(g.getByRole("heading", { name: /^Tamu · 12\.20$/ })).toBeVisible();
    await expect(g.getByTestId("gallery-photo")).toHaveCount(4);
    await g.screenshot({ path: "test-results/gallery-stage.png", fullPage: true });
    // #191: blok per jam + unduh per rombongan (ZIP satu sesi).
    await expect(g.getByText("12.00 – 13.00")).toBeVisible();
    await expect(g.getByText("2 rombongan")).toBeVisible();
    const one = await request.get(
      (await g.getByRole("link", { name: "Unduh rombongan" }).first().getAttribute("href")) ?? "",
    );
    expect(one.headers()["content-disposition"]).toContain(`-stage-${inti}.zip`);
    await g.getByLabel("Cari nama grup").fill("xyz");
    await expect(g.getByText("“xyz” belum ketemu")).toBeVisible();
    await g.getByLabel("Cari nama grup").fill("inti");
    await expect(g.getByTestId("gallery-photo")).toHaveCount(2);
    await expect(g.getByRole("heading", { name: /^Tamu/ })).toBeHidden();

    const s = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await s.goto(`/s/${inti}`);
    await expect(s.getByRole("heading", { name: "Keluarga Inti" })).toBeVisible();
    await expect(s.getByRole("tablist")).toHaveCount(0);
    await expect(s.getByText("1 / 2")).toBeVisible();
    await expect(s.getByRole("button", { name: "Simpan semua (2 foto)" })).toBeEnabled();
    await s.screenshot({ path: "test-results/guest-stage.png", fullPage: true });

    // C7b (#190): rombongan yang masih dikirim dari laptop stage.
    await s.goto(`/s/${kirim}`);
    await expect(s.getByRole("heading", { name: "Teman Kantor PT ABC" })).toBeVisible();
    await expect(s.getByText("Foto sedang dikirim…")).toBeVisible();
    await expect(s.getByText("0 dari 4")).toBeVisible();
    await expect(s.getByRole("button", { name: "Simpan semua" })).toBeDisabled();
    await s.screenshot({ path: "test-results/guest-stage-sending.png", fullPage: true });

    const live = await (await request.get(`/api/live/e2e-stage-live-${tag}`)).json();
    expect((live as { id: string }[]).map((x) => x.id).sort()).toEqual([booth, inti, tamu].sort());

    // Cuplikan untuk dashboard klien Ops (#185): sampul, satu thumbnail per sesi (terbaru dulu), modules.
    const res = await request.get(`/api/ops/events/PRJ-E2E-STAGE-${tag}`, {
      headers: { authorization: `Bearer ${process.env.TETRA_OPS_API_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const [ops] = (
      (await res.json()) as {
        events: {
          modules: string[];
          cover_url: string | null;
          thumbs: { url: string; kind: string }[];
        }[];
      }
    ).events;
    expect(ops?.modules).toEqual(["photobooth", "photo_stage"]);
    expect(ops?.thumbs.map((x) => x.kind)).toEqual(["original", "original", "strip"]);
    expect(ops?.thumbs[0]?.url).toMatch(/thumb_original_1\.jpg\?.*X-Amz-Expires=86400/);
    expect(ops?.cover_url).toMatch(/original_1\.jpg\?/);
  } finally {
    await db.from("events").delete().eq("id", eventId);
  }
});

test("Pengaturan event: daftar grup Photo Stage (tempel + impor CSV) masuk bundle (#181)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const name = `e2e stage grup ${Date.now()}`;
  try {
    await login(page, u);
    const slug = await createEventViaWizard(page, {
      name,
      date: "2026-12-20",
      paper: /Foto 4R/,
      design: "auto",
    });
    await page.goto(`/admin/events/${slug}/settings`);
    await page.getByLabel(/^Daftar grup/).fill("1. Keluarga Inti\nKeluarga Besar Bpk. Hadi\tBogor");
    await page.locator('label:has-text("Impor CSV / TXT") input[type=file]').setInputFiles({
      name: "grup.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Teman Kantor PT ABC;20 orang\r\nKeluarga Inti\r\n"),
    });
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan", { timeout: 30_000 });
    const { data: ev } = await db
      .from("events")
      .select("settings, bundle")
      .eq("slug", slug)
      .single();
    const groups = ["Keluarga Inti", "Keluarga Besar Bpk. Hadi", "Teman Kantor PT ABC"];
    expect((ev?.settings as { stageGroups?: string[] } | undefined)?.stageGroups).toEqual(groups);
    expect(
      (ev?.bundle as { config?: { settings?: { stageGroups?: string[] } } } | undefined)?.config
        ?.settings?.stageGroups,
    ).toEqual(groups);
  } finally {
    await db.from("events").delete().eq("name", name);
    await u.cleanup();
  }
});
