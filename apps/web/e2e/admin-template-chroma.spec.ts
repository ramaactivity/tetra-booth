import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";
import { createTemplateViaWizard, makeJpg } from "./template-helpers";

/** Hapus warna penanda (#163): JPG Canva dengan kotak foto kuning → transparan → slot; juga di editor. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local) + R2");
test.use({ viewport: { width: 1440, height: 900 } });

type Slot = { x: number; y: number; w: number; h: number };
type Spec = { layout: { slots: Slot[] }; files: Record<string, { key: string }> };

// JPG 1066×1600 (2:3) → kanvas 4R 1200×1800: kotak kuning [80, 80, 906, 1200] ≈ [90, 90, 1020, 1350] + pad 2.
const near = (s: Slot | undefined) => {
  expect(s).toBeDefined();
  const { x, y, w, h } = s as Slot;
  for (const [a, b] of [
    [x, 88],
    [y, 88],
    [w, 1024],
    [h, 1354],
  ] as const)
    expect(Math.abs(a - b)).toBeLessThanOrEqual(4);
};

test("upload JPG berwarna penanda: warna otomatis dihapus, 1 slot, template dibuat; editor chroma key", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const name = `e2e chroma ${Date.now()}`;
  try {
    await login(page, u);
    await page.goto("/admin/templates");
    const jpg = await makeJpg(page, 1066, 1600, [80, 80, 906, 1200]);
    await createTemplateViaWizard(page, {
      name,
      upload: jpg,
      onUpload: async (dlg) => {
        const sec = dlg.getByRole("region", { name: "Hapus warna penanda" });
        await expect(sec).toBeVisible();
        await expect(sec.getByText("akan dihapus jadi transparan")).toBeVisible();
        await expect(dlg.getByText("1 slot foto terdeteksi")).toBeVisible();
        // Desain tanpa transparansi: hapus warna wajib (tanpa tombol "Jangan hapus warna").
        await expect(dlg.getByRole("button", { name: "Jangan hapus warna" })).toHaveCount(0);
        await page.screenshot({ path: "test-results/templates-chroma-upload.png" });
      },
    });
    const { data: l } = await db
      .from("layouts")
      .select("id, layout_versions(spec)")
      .eq("name", name)
      .single();
    const spec = l?.layout_versions[0]?.spec as Spec;
    expect(spec.layout.slots).toHaveLength(1);
    near(spec.layout.slots[0]);
    expect(spec.files.ov?.key).toMatch(/\.png$/);

    // Editor: ganti overlay dengan JPG yang sama → hapus warna → deteksi slot; bisa diurungkan.
    await page.getByRole("button", { name: "Unggahan" }).click();
    await page.getByLabel("Overlay", { exact: true }).setInputFiles(jpg);
    await page.getByRole("button", { name: "Hapus warna (chroma key)" }).click();
    const panel = page.getByRole("region", { name: "Hapus warna" });
    await expect(
      panel.getByRole("button", { name: "Ambil warna penanda dari gambar" }),
    ).toBeVisible();
    await page.waitForTimeout(500);
    await page.screenshot({ path: "test-results/templates-chroma-editor.png" });
    await panel.getByRole("button", { name: "Terapkan" }).click();
    await expect(page.getByText("Warna dihapus.")).toBeVisible();
    const detect = page.getByRole("button", { name: "Deteksi slot dari area transparan" });
    await detect.click();
    await expect(page.getByText("1 slot dibuat dari area transparan")).toBeVisible();
    await page.getByRole("button", { name: "Urungkan" }).click(); // slot
    await page.getByRole("button", { name: "Urungkan" }).click(); // hapus warna
    await detect.click();
    await expect(page.getByText("Tidak ada area transparan yang cukup besar")).toBeVisible();
    await page.getByRole("button", { name: "Ulangi" }).click(); // hapus warna lagi
    await detect.click();
    await expect(page.getByText("1 slot dibuat dari area transparan")).toBeVisible();
    await page.screenshot({ path: "test-results/templates-chroma-editor-done.png" });
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByRole("status").first()).toContainText("versi 2", { timeout: 30_000 });
    const { data: v } = await db
      .from("layout_versions")
      .select("spec")
      .eq("layout_id", l?.id ?? "")
      .eq("version", 2)
      .single();
    const s2 = v?.spec as Spec;
    expect(s2.layout.slots).toHaveLength(1);
    near(s2.layout.slots[0]);
  } finally {
    const { data: l } = await db.from("layouts").select("id").eq("name", name).maybeSingle();
    if (l) {
      await db.from("layout_versions").delete().eq("layout_id", l.id);
      await db.from("layouts").delete().eq("id", l.id);
    }
    await u.cleanup();
  }
});
