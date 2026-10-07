import { expect, test } from "@playwright/test";
import { LAYOUT_PRESETS, newSessionId } from "@tetra/shared";
import { db, hasDb, login, makeUser } from "./admin-helpers";
import { createTemplateViaWizard } from "./template-helpers";

/** Halaman Template (#160): tab Event/Photobox, statistik & pemakaian photobox, filter, wizard, pasang ke event. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local) + migrasi 0020_layout_mode_usage");

const spec = (id: string, preset: keyof typeof LAYOUT_PRESETS) => ({
  layout: { id, version: 1, ...LAYOUT_PRESETS[preset].layout, background: { color: "#ffffff" } },
  files: {},
});

test("tab Event/Photobox terpisah, statistik pemakaian, filter, pasang ke event", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const ts = Date.now();
  const evTpl = `e2e list ev ${ts}`;
  const pbTpl = `e2e list pb ${ts}`;
  const pbTpl2 = `e2e list pb2 ${ts}`;
  const { data: dev } = await db
    .from("devices")
    .insert({ organization_id: u.org, name: `e2e list ${ts}`, short_code: `L${ts % 1e6}` })
    .select("id")
    .single();
  const ids: string[] = [];
  const mk = async (name: string, mode: string, preset: keyof typeof LAYOUT_PRESETS) => {
    const { data } = await db
      .from("layouts")
      .insert({
        organization_id: u.org,
        name,
        mode,
        paper: LAYOUT_PRESETS[preset].layout.paper,
      })
      .select("id")
      .single();
    const id = data?.id ?? "";
    ids.push(id);
    await db
      .from("layout_versions")
      .insert({ organization_id: u.org, layout_id: id, version: 1, spec: spec(id, preset) });
    return id;
  };
  const evId = await mk(evTpl, "event", "4r-grid");
  const pbId = await mk(pbTpl, "photobox", "strip-3");
  await mk(pbTpl2, "photobox", "4r-single");
  const { data: pbEvent } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e list photobox ${ts}`,
      mode: "photobox",
      event_date: "2026-10-01",
      settings: {
        photobox: { layouts: [{ template: pbId, price: 20000 }], extraPrintPrice: 10000 },
      },
    })
    .select("id")
    .single();
  const { data: evEvent } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e list event ${ts}`,
      mode: "event",
      event_date: "2099-12-01",
    })
    .select("id")
    .single();
  // 2 sesi lunas (satu + 1 lembar tambahan) + 1 sesi tes (tidak dihitung).
  const now = new Date().toISOString();
  const sess = [newSessionId(), newSessionId(), newSessionId()];
  await db.from("sessions").insert(
    sess.map((id, i) => ({
      id,
      organization_id: u.org,
      event_id: pbEvent?.id ?? "",
      device_id: dev?.id ?? "",
      started_at: now,
      is_test: i === 2,
    })),
  );
  const pay = (session_id: string, kind: string, prints: number) => ({
    organization_id: u.org,
    event_id: pbEvent?.id ?? "",
    device_id: dev?.id ?? "",
    layout_key: `tpl-${pbId}`,
    kind,
    prints,
    amount_idr: 20000,
    provider: "fake",
    session_id,
    status: "paid",
    paid_at: now,
    expires_at: now,
  });
  await db
    .from("payments")
    .insert([
      pay(sess[0] ?? "", "package", 1),
      pay(sess[1] ?? "", "package", 1),
      pay(sess[1] ?? "", "extra_prints", 1),
      pay(sess[2] ?? "", "package", 1),
    ]);

  try {
    await login(page, u);
    await page.goto("/admin/templates");
    // Tab Event: template event ada, template photobox tidak.
    await expect(page.getByRole("link", { name: evTpl, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: pbTpl, exact: true })).toHaveCount(0);
    await page.getByPlaceholder("Cari nama template").fill(evTpl);
    await expect(page).toHaveURL(/q=e2e/);
    await expect(page.getByRole("link", { name: evTpl, exact: true })).toBeVisible();
    await page.goto("/admin/templates");
    // Pratinjau asli dirender template engine di browser (antre satu per satu).
    const loading = page.locator('[aria-label$="(memuat pratinjau)"]');
    await expect(loading).toHaveCount(0, { timeout: 60_000 });
    await page.screenshot({ path: "test-results/templates-event.png", fullPage: true });

    // Tab Photobox: pemakaian tanpa sesi tes, statistik bulan ini, terfavorit.
    await page
      .getByRole("navigation", { name: "Mode template" })
      .getByRole("link", { name: /^Photobox/ })
      .click();
    await expect(page).toHaveURL(/tab=photobox/);
    const card = page.getByRole("listitem").filter({ hasText: pbTpl });
    await expect(card.getByTestId("tpl-usage")).toContainText("2 sesi · 3 lembar");
    await expect(page.getByTestId("stat-top")).toBeVisible();
    await expect(loading).toHaveCount(0, { timeout: 60_000 });
    await page.screenshot({ path: "test-results/templates-photobox.png", fullPage: true });

    // Filter kertas 2R dari strip statistik + urut paling sering dipakai.
    await page.getByRole("link", { name: /^2R:/ }).click();
    await expect(page).toHaveURL(/kertas=2R/);
    await expect(page.getByRole("link", { name: pbTpl, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: pbTpl2, exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: /^2R:/ }).click();
    await expect(page).not.toHaveURL(/kertas=/);

    // Tampilan daftar diingat (cookie).
    await page.getByRole("button", { name: "Daftar" }).click();
    await expect(page.getByText("Terakhir dipakai", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("Terakhir dipakai", { exact: true })).toBeVisible();
    await expect(loading).toHaveCount(0, { timeout: 60_000 });
    await page.screenshot({ path: "test-results/templates-photobox-list.png", fullPage: true });
    await page.getByRole("button", { name: "Kartu" }).click();
    await expect(page.getByText("Terakhir dipakai", { exact: true })).toHaveCount(0);

    // Pindah ke Event lewat menu.
    await page.getByRole("button", { name: `Lainnya untuk ${pbTpl2}` }).click();
    await page.getByRole("button", { name: "Pindah ke Event" }).click();
    await expect(page.getByRole("link", { name: pbTpl2, exact: true })).toHaveCount(0);
    expect((await db.from("layouts").select("mode").eq("name", pbTpl2).single()).data?.mode).toBe(
      "event",
    );

    // Pasang template event ke event mendatang lewat menu → desain utama event.
    await page.goto("/admin/templates");
    await page.getByRole("button", { name: `Lainnya untuk ${evTpl}` }).click();
    await page.getByRole("button", { name: "Pasang ke event…" }).click();
    const dlg = page.getByRole("dialog", { name: `Pasang ${evTpl} ke event` });
    await dlg.getByRole("combobox", { name: "Event" }).click();
    await page.getByRole("option", { name: new RegExp(`e2e list event ${ts}`) }).click();
    await dlg.getByRole("button", { name: "Pasang" }).click();
    await expect(dlg.getByRole("status")).toContainText("Jadi desain utama", { timeout: 30_000 });
    const { data: ev } = await db
      .from("events")
      .select("settings, bundle_version")
      .eq("id", evEvent?.id ?? "")
      .single();
    expect(
      (ev?.settings as { template?: { layoutId?: string } } | undefined)?.template?.layoutId,
    ).toBe(evId);
    expect(ev?.bundle_version).toBe(2);
  } finally {
    await db
      .from("payments")
      .delete()
      .eq("event_id", pbEvent?.id ?? "");
    await db
      .from("events")
      .delete()
      .in("id", [pbEvent?.id ?? "", evEvent?.id ?? ""]);
    for (const id of ids) {
      await db.from("layout_versions").delete().eq("layout_id", id);
      await db.from("layouts").delete().eq("id", id);
    }
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await u.cleanup();
  }
});

test("wizard: template photobox baru langsung dijual di photobox", async ({ page }) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const ts = Date.now();
  const name = `e2e wiz pb ${ts}`;
  const { data: pbEvent } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e wiz photobox ${ts}`,
      mode: "photobox",
      event_date: "2026-10-01",
      settings: {
        photobox: { layouts: [{ preset: "strip-3", price: 15000 }], extraPrintPrice: 10000 },
      },
    })
    .select("id")
    .single();
  try {
    await login(page, u);
    await page.goto("/admin/templates?tab=photobox");
    await createTemplateViaWizard(page, {
      name,
      mode: "Photobox",
      paper: "Strip 2R",
      source: /Strip 4 Foto/,
      event: { name: `e2e wiz photobox ${ts}`, price: "30000" },
      shot: "templates-wizard",
    });
    const { data: l } = await db
      .from("layouts")
      .select("id, mode, paper")
      .eq("name", name)
      .single();
    expect(l).toMatchObject({ mode: "photobox", paper: "2x6x2" });
    const { data: ev } = await db
      .from("events")
      .select("settings")
      .eq("id", pbEvent?.id ?? "")
      .single();
    expect(
      (ev?.settings as { photobox?: { layouts: unknown[] } } | undefined)?.photobox?.layouts,
    ).toEqual([
      { preset: "strip-3", price: 15000 },
      { template: l?.id, price: 30000 },
    ]);
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", pbEvent?.id ?? "");
    const { data: l } = await db.from("layouts").select("id").eq("name", name).maybeSingle();
    if (l) {
      await db.from("layout_versions").delete().eq("layout_id", l.id);
      await db.from("layouts").delete().eq("id", l.id);
    }
    await u.cleanup();
  }
});
