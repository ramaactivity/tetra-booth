import { expect, type Page, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Tata letak cepat → "Tata letak saya": simpan posisi slot, pakai di desain lain berkertas sama, hapus. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local) + migrasi 0009_layout_presets");

async function newTemplate(page: Page, name: string) {
  await page.goto("/admin/templates");
  await page.getByRole("button", { name: "+ Buat Template" }).click();
  await page.getByPlaceholder(/Nama template/).fill(name);
  await page.getByRole("button", { name: "Buat", exact: true }).click();
  await expect(page.getByLabel("Nama template")).toHaveValue(name);
}

test("editor template: simpan tata letak sendiri lalu pakai di template lain", async ({ page }) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const ts = Date.now();
  const tpl1 = `e2e preset src ${ts}`;
  const tpl2 = `e2e preset dst ${ts}`;
  const presetName = `e2e preset ${ts}`;
  const foto = (n: number) => page.getByRole("button", { name: `Foto ${n}`, exact: true });
  // Pindah template dengan perubahan belum disimpan memicu beforeunload.
  page.on("dialog", (d) => d.accept());
  try {
    await login(page, u);
    await newTemplate(page, tpl1);

    // Atur: tata letak bawaan 4R Duo, lalu geser Foto 1 lewat panel Posisi.
    await page.getByRole("button", { name: /^4R Duo/ }).click();
    await expect(foto(3)).toHaveCount(0);
    await foto(1).click();
    await page.getByRole("button", { name: "Posisi", exact: true }).first().click();
    await page.getByLabel("X", { exact: true }).fill("100");
    await page.getByLabel("Y", { exact: true }).fill("120");
    await expect(page.getByLabel("X", { exact: true })).toHaveValue("100");

    await page.getByRole("button", { name: "Elemen", exact: true }).click();
    await expect(page.getByRole("button", { name: `Pakai tata letak ${presetName}` })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Simpan tata letak ini" }).click();
    const nameInput = page.getByLabel("Nama tata letak");
    await expect(nameInput).toHaveValue("Tata letak 2 foto");
    await nameInput.fill(presetName);
    await page.getByRole("button", { name: "Simpan tata letak", exact: true }).click();
    await expect(
      page.getByRole("button", { name: `Pakai tata letak ${presetName}` }),
    ).toBeVisible();

    const { data: row } = await db
      .from("layout_presets")
      .select("organization_id, paper, width, height, slots")
      .eq("name", presetName)
      .single();
    expect(row).toMatchObject({ organization_id: u.org, paper: "4R", width: 1200, height: 1800 });
    const slots = row?.slots as { x: number; y: number }[];
    expect(slots).toHaveLength(2);
    expect(slots[0]).toMatchObject({ x: 100, y: 120 });

    // Template kedua (4R portrait, bawaan 4 slot): tata letak tersimpan muncul dan bisa dipakai.
    await newTemplate(page, tpl2);
    await expect(foto(4)).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tata letak saya" })).toBeVisible();
    const apply = page.getByRole("button", { name: `Pakai tata letak ${presetName}` });
    await expect(apply).toBeVisible();
    await page.screenshot({ path: "test-results/editor-presets.png" });
    await apply.click();
    await expect(foto(3)).toHaveCount(0);
    await foto(1).click();
    await page.getByRole("button", { name: "Posisi", exact: true }).first().click();
    await expect(page.getByLabel("X", { exact: true })).toHaveValue("100");
    await expect(page.getByLabel("Y", { exact: true })).toHaveValue("120");
    // Bisa di-urungkan seperti tata letak bawaan.
    await page.getByRole("button", { name: "Urungkan" }).click();
    await expect(foto(4)).toBeVisible();

    // Hapus (konfirmasi inline).
    await page.getByRole("button", { name: "Elemen", exact: true }).click();
    await page.getByRole("button", { name: `Hapus tata letak ${presetName}` }).click();
    await page.getByRole("button", { name: "Ya", exact: true }).click();
    await expect(apply).toHaveCount(0);
    await expect
      .poll(async () => (await db.from("layout_presets").select("id").eq("name", presetName)).data)
      .toHaveLength(0);
  } finally {
    await db.from("layout_presets").delete().eq("name", presetName);
    for (const n of [tpl1, tpl2]) {
      const { data: l } = await db.from("layouts").select("id").eq("name", n).maybeSingle();
      if (l) {
        await db.from("layout_versions").delete().eq("layout_id", l.id);
        await db.from("layouts").delete().eq("id", l.id);
      }
    }
    await u.cleanup();
  }
});
