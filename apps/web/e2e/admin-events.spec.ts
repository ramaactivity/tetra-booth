import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** A3/A4: buat event → pengaturan + template → tugaskan booth → booth menarik bundle lewat API. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const sha = (b: Buffer | Uint8Array) => createHash("sha256").update(b).digest("hex");

test("buat event, atur template + overlay, tugaskan booth, booth menarik bundle", async ({
  page,
  request,
}) => {
  const u = await makeUser("owner");
  const token = randomBytes(40).toString("base64url");
  const name = `e2e event ${Date.now()}`;
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: u.org,
      name: `e2e booth ${Date.now()}`,
      short_code: `E${Date.now() % 1e6}`,
      token_hash: sha(Buffer.from(token)),
    })
    .select("id, name")
    .single();
  try {
    await login(page, u);
    await page.getByRole("button", { name: "+ Buat Event" }).click();
    await page.getByPlaceholder(/Nama event/).fill(name);
    await page.getByLabel("Tanggal event").fill("2026-10-12");
    await page.getByRole("button", { name: "Buat", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Pengaturan" })).toBeVisible();

    await page.getByLabel(/Teks kecil di layar booth/).fill("The Wedding of");
    await page.getByRole("group", { name: "Layout", exact: true }).getByText("4R Grid").click();
    await page
      .locator('input[name="overlay"]')
      .setInputFiles({ name: "ov.png", mimeType: "image/png", buffer: PNG });
    await page.getByLabel("Maks. cetak per sesi").fill("3");
    await page.getByLabel(dev?.name ?? "").check();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v2");
    await page.screenshot({ path: "test-results/admin-settings.png", fullPage: true });

    const auth = { Authorization: `Bearer ${token}` };
    const { events } = await (await request.get("/api/booth/events", { headers: auth })).json();
    const ev = events.find((e: { name: string }) => e.name === name);
    expect(ev?.bundleVersion).toBe(2);
    const m = await (
      await request.get(`/api/booth/events/${ev.id}/bundle`, { headers: auth })
    ).json();
    expect(m.config).toMatchObject({
      name,
      tagline: "The Wedding of",
      date: "12 Oktober 2026",
      layout: { paper: "4R", overlay: { assetId: "ov" } },
      settings: { maxPrints: 3 },
      assets: { ov: "overlay.png" },
    });
    expect(m.config.layout.slots).toHaveLength(4);
    const file = await fetch(m.files[0].url);
    expect(file.status).toBe(200);
    expect(sha(new Uint8Array(await file.arrayBuffer()))).toBe(m.files[0].sha256);

    // Fase 4: mode photobox butuh minimal satu layout dijual; bundle memuat layout + harga.
    await page.getByText("Mode Photobox", { exact: true }).click();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("centang minimal satu layout");
    await page.getByRole("checkbox", { name: /4R Grid/ }).check();
    await page.getByLabel("Harga 4R Grid").fill("35000");
    await page.getByRole("checkbox", { name: /Strip Klasik/ }).check();
    await page.getByLabel("Harga Strip Klasik").fill("25000");
    await page.getByLabel("Harga lembar tambahan").fill("10000");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v3");
    const pb = await (
      await request.get(`/api/booth/events/${ev.id}/bundle`, { headers: auth })
    ).json();
    expect(pb.config.mode).toBe("photobox");
    expect(pb.config.photobox.extraPrintPrice).toBe(10000);
    expect(
      pb.config.photobox.layouts.map((l: { id: string; price: number }) => [l.id, l.price]),
    ).toEqual([
      ["strip-3", 25000],
      ["4r-grid", 35000],
    ]);

    await page.goto("/admin");
    await expect(page.getByRole("link", { name: new RegExp(name) })).toContainText(dev?.name ?? "");
  } finally {
    await db.from("events").delete().eq("name", name);
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await u.cleanup();
  }
});
