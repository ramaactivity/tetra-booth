import { expect, test } from "@playwright/test";
import { createEventViaWizard, db, hasDb, login, makeUser } from "./admin-helpers";
import { makePng } from "./template-helpers";

/** Wizard Buat event, langkah Desain (#162): lewati = template otomatis, atau unggah desain PNG (#161). */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local) + R2");
test.use({ viewport: { width: 1440, height: 900 } });

const check = async (name: string, slots: number, overlay: boolean) => {
  const { data: ev } = await db.from("events").select("settings").eq("name", name).single();
  const tpl = (ev?.settings as { template?: { layoutId?: string } } | undefined)?.template;
  const { data: l } = await db
    .from("layouts")
    .select("id, name, mode, paper, layout_versions(spec)")
    .eq("id", tpl?.layoutId ?? "")
    .single();
  const spec = l?.layout_versions[0]?.spec as {
    layout: { slots: unknown[]; overlay?: unknown };
  };
  expect(l).toMatchObject({ name, mode: "event" });
  expect(spec.layout.slots).toHaveLength(slots);
  expect(!!spec.layout.overlay).toBe(overlay);
  return l;
};
const cleanup = async (name: string) => {
  const { data: ev } = await db.from("events").select("settings").eq("name", name).maybeSingle();
  await db.from("events").delete().eq("name", name);
  const id = (ev?.settings as { template?: { layoutId?: string } } | undefined)?.template?.layoutId;
  if (id) {
    await db.from("layout_versions").delete().eq("layout_id", id);
    await db.from("layouts").delete().eq("id", id);
  }
};

test("lewati desain: template baru bernama event dibuat & dipasang", async ({ page }) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const name = `e2e wiz auto ${Date.now()}`;
  try {
    await login(page, u);
    await createEventViaWizard(page, {
      name,
      paper: /Strip 2R/,
      design: "auto",
      shot: "wizard-design-auto",
    });
    const l = await check(name, 3, false);
    expect(l?.paper).toBe("2x6x2");
    await page.screenshot({ path: "test-results/wizard-design-auto-done.png", fullPage: true });
    await expect(page.getByRole("link", { name: "Edit desain sekarang" })).toHaveAttribute(
      "href",
      `/admin/templates/${l?.id}`,
    );
  } finally {
    await cleanup(name);
    await u.cleanup();
  }
});

test("upload desain PNG di wizard event: template bernama event + slot terdeteksi", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const name = `e2e wiz upload ${Date.now()}`;
  try {
    await login(page, u);
    const png = await makePng(page, 1200, 1800, [
      [80, 80, 500, 700],
      [620, 80, 500, 700],
      [80, 860, 1040, 700],
    ]);
    await createEventViaWizard(page, {
      name,
      paper: /Foto 4R/,
      design: png,
      shot: "wizard-design-upload",
    });
    const l = await check(name, 3, true);
    expect(l?.paper).toBe("4R");
    await expect(page.getByRole("link", { name: "Edit desain sekarang" })).toBeVisible();
  } finally {
    await cleanup(name);
    await u.cleanup();
  }
});
