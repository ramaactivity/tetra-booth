import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Editor template: elemen QR unduh foto (satu per desain) — tambah, ubah ukuran, geser, hapus/urungkan, simpan. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("editor template: QR unduh foto tersimpan di layout", async ({ page }) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const tplName = `e2e qr ${Date.now()}`;
  try {
    await login(page, u);
    await page.goto("/admin/templates");
    await page.getByRole("button", { name: "+ Buat Template" }).click();
    await page.getByPlaceholder(/Nama template/).fill(tplName);
    await page.getByRole("button", { name: "Buat", exact: true }).click();
    await expect(page.getByLabel("Nama template")).toHaveValue(tplName);

    // Bawaan 4R 1200×1800: sisi 22% × 1200 = 264, kanan bawah di dalam margin aman 36.
    const addQr = page.getByRole("button", { name: /^QR unduh foto Tamu scan/ });
    await addQr.click();
    const qr = page.getByRole("button", { name: "QR unduh foto", exact: true });
    await expect(qr).toHaveAttribute("aria-pressed", "true");
    const size = page.getByLabel("Ukuran QR");
    await expect(size).toHaveValue("264");
    await size.fill("300");
    await expect(size).toHaveValue("300");
    await page.getByRole("button", { name: "Urungkan" }).click();
    await expect(size).toHaveValue("264");
    await page.getByRole("button", { name: "Ulangi" }).click();
    await expect(size).toHaveValue("300");

    // Hanya satu QR: tombol kedua kali cukup memilihnya.
    await page.keyboard.press("Escape");
    await addQr.click();
    await expect(qr).toHaveCount(1);
    await expect(qr).toHaveAttribute("aria-pressed", "true");

    // Geser ke kiri (tanpa snap: Alt).
    const box = await qr.boundingBox();
    if (!box) throw new Error("qr");
    await page.keyboard.down("Alt");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 120, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await page.keyboard.up("Alt");
    // Tarik sudut kanan bawah: tetap persegi (satu nilai `size`), lebih besar.
    const h = page.locator('[data-handle="1,1"]');
    const hb = await h.boundingBox();
    if (!hb) throw new Error("handle");
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(hb.x + hb.width / 2 + 20, hb.y + hb.height / 2 + 20, { steps: 4 });
    await page.mouse.up();
    const grown = Number(await size.inputValue());
    expect(grown).toBeGreaterThan(300);
    await page.getByRole("button", { name: "Urungkan" }).click();
    await expect(size).toHaveValue("300");

    await page.getByRole("button", { name: "Posisi", exact: true }).first().click();
    const x = Number(await page.getByLabel("X", { exact: true }).inputValue());
    expect(x).toBeLessThan(1200 - 36 - 300 - 50);
    await expect(page.getByLabel("Ukuran", { exact: true })).toHaveValue("300");

    // Hapus (Delete) lalu kembalikan (⌘Z); juga muncul di panel Layer.
    await page.keyboard.press("Delete");
    await expect(qr).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+z");
    await expect(qr).toHaveCount(1);
    await page.getByRole("button", { name: "Layer", exact: true }).click();
    await page
      .getByRole("complementary")
      .getByRole("button", { name: /^QR unduh foto/ })
      .click();
    await expect(qr).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · versi 2", {
      timeout: 30_000,
    });

    await page.reload();
    await expect(qr).toHaveCount(1);
    await qr.click();
    await expect(page.getByLabel("Ukuran QR")).toHaveValue("300");
    await page.screenshot({ path: "test-results/editor-qr.png" });

    // Zoom mengubah ukuran <canvas> pratinjau: isinya harus digambar ulang (bug 30 Sep: overlay/teks hilang).
    const inked = () =>
      page
        .getByTestId("stage-page")
        .locator("canvas")
        .evaluate((c: HTMLCanvasElement) => {
          const d = c.getContext("2d")?.getImageData(0, 0, c.width, c.height).data ?? [];
          let dark = 0;
          for (let i = 0; i < d.length; i += 16)
            if ((d[i + 3] ?? 0) > 200 && (d[i] ?? 255) < 100) dark++;
          return dark;
        });
    await page.getByRole("button", { name: "Perbesar" }).click();
    await page.getByRole("button", { name: "Perbesar" }).click();
    await expect.poll(inked).toBeGreaterThan(50);
    await page.getByRole("button", { name: "Perkecil" }).click();
    await expect.poll(inked).toBeGreaterThan(50);

    const { data: l } = await db.from("layouts").select("id").eq("name", tplName).single();
    const { data: v } = await db
      .from("layout_versions")
      .select("spec")
      .eq("layout_id", l?.id ?? "")
      .eq("version", 2)
      .single();
    const spec = v?.spec as { layout: { qr?: { x: number; y: number; size: number } } };
    // Ukuran diketik 300: QR digeser naik supaya tetap di dalam margin aman (36 px).
    expect(spec.layout.qr).toMatchObject({ y: 1800 - 36 - 300, size: 300 });
  } finally {
    const { data: l } = await db.from("layouts").select("id").eq("name", tplName).maybeSingle();
    if (l) {
      await db.from("layout_versions").delete().eq("layout_id", l.id);
      await db.from("layouts").delete().eq("id", l.id);
    }
    await u.cleanup();
  }
});
