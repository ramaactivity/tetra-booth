import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";
import { createTemplateViaWizard, makePng } from "./template-helpers";

/** Wizard Buat Template → Upload desain (PNG) (#161): slot dari area transparan, overlay di atas foto. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local) + R2");

type Spec = {
  layout: { slots: { x: number; y: number; w: number; h: number; z: string }[]; overlay?: unknown };
  files: Record<string, { key: string }>;
};

test("upload desain PNG: 2 area transparan jadi 2 slot + overlay", async ({ page }) => {
  test.setTimeout(90_000);
  const u = await makeUser("owner");
  const name = `e2e upload ${Date.now()}`;
  try {
    await login(page, u);
    await page.goto("/admin/templates");
    // 4R portrait: lubang atas kotak, lubang bawah membulat (kotak pembatas).
    const png = await makePng(page, 1200, 1800, [
      [80, 80, 1040, 760],
      [80, 900, 1040, 640, 60],
    ]);
    await createTemplateViaWizard(page, { name, upload: png, shot: "templates-upload" });
    // Editor terbuka: tunggu overlay ter-render sebelum screenshot.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "test-results/templates-upload-editor.png" });
    const { data: l } = await db
      .from("layouts")
      .select("id, paper, layout_versions(spec)")
      .eq("name", name)
      .single();
    const spec = l?.layout_versions[0]?.spec as Spec;
    expect(l?.paper).toBe("4R");
    expect(spec.layout.overlay).toEqual({ assetId: "ov" });
    expect(spec.files.ov?.key).toMatch(/\/layouts\/.+\.png$/);
    expect(spec.layout.slots.map(({ x, y, w, h, z }) => ({ x, y, w, h, z }))).toEqual([
      { x: 78, y: 78, w: 1044, h: 764, z: "below_overlay" },
      { x: 78, y: 898, w: 1044, h: 644, z: "below_overlay" },
    ]);
    // Editor: deteksi ulang dari overlay tersimpan (Unggahan) → tetap 2 slot.
    await page.getByRole("button", { name: "Unggahan" }).click();
    await page.getByRole("button", { name: "Deteksi slot dari area transparan" }).click();
    await expect(page.getByText("2 slot dibuat dari area transparan")).toBeVisible();
    await page.screenshot({ path: "test-results/templates-upload-editor-detect.png" });
  } finally {
    const { data: l } = await db.from("layouts").select("id").eq("name", name).maybeSingle();
    if (l) {
      await db.from("layout_versions").delete().eq("layout_id", l.id);
      await db.from("layouts").delete().eq("id", l.id);
    }
    await u.cleanup();
  }
});

test("upload desain: rasio beda diberi peringatan + saran kertas", async ({ page }) => {
  const u = await makeUser("owner");
  try {
    await login(page, u);
    await page.goto("/admin/templates");
    const png = await makePng(page, 300, 900, [[20, 20, 260, 260]], "strip.png"); // rasio strip 2R
    await page.getByRole("button", { name: "Buat Template" }).click();
    const dlg = page.getByRole("dialog", { name: "Buat template" });
    await dlg.getByRole("button", { name: "Lanjut" }).click();
    await dlg.getByRole("button", { name: "Lanjut" }).click();
    await expect(dlg.getByRole("button", { name: "Lanjut" })).toBeDisabled();
    await dlg.getByLabel("Desain PNG").setInputFiles(png);
    await expect(dlg.getByRole("alert")).toContainText("tidak sebanding");
    await page.screenshot({ path: "test-results/templates-upload-mismatch.png" });
    await dlg.getByRole("button", { name: "Pakai Strip 2R portrait" }).click();
    await expect(dlg.getByText("1 slot foto terdeteksi")).toBeVisible();
    await expect(dlg.getByText("disesuaikan ke 600×1800 px")).toBeVisible();
    await expect(dlg.getByRole("button", { name: "Lanjut" })).toBeEnabled();
  } finally {
    await u.cleanup();
  }
});
