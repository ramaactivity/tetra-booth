import { createHash, randomBytes } from "node:crypto";
import { deflateSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Editor template E4 (DECISIONS #74): buat → ubah slot/teks/overlay → versi baru → dipakai event → bundle booth. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** PNG transparan w×h yang valid (header IHDR dicek server). */
function png(w: number, h: number) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = (crcTable[(c ^ x) & 0xff] ?? 0) ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    t.copy(out, 4);
    out.writeUInt32BE(crc(t), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((w * 4 + 1) * h);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("editor template: versi baru, dipakai event, booth menerima layout + aset", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const token = randomBytes(40).toString("base64url");
  const tplName = `e2e tpl ${Date.now()}`;
  const evName = `e2e tpl event ${Date.now()}`;
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: u.org,
      name: `e2e booth ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      short_code: `T${Date.now() % 1e6}`,
      token_hash: sha(Buffer.from(token)),
    })
    .select("id, name")
    .single();
  try {
    await login(page, u);
    await page.getByRole("link", { name: "Template" }).click();
    await page.getByRole("button", { name: "+ Buat Template" }).click();
    await page.getByPlaceholder(/Nama template/).fill(tplName);
    await page.getByLabel("Mulai dari").selectOption("4r-grid");
    await page.getByRole("button", { name: "Buat", exact: true }).click();
    await expect(page.getByLabel("Nama template")).toHaveValue(tplName);

    // Slot 1: posisi lewat panel properti, lalu layer di atas overlay; slot kelima ditambah.
    await page.getByRole("button", { name: "Slot 1", exact: true }).click();
    await page.getByLabel("Kunci rasio").uncheck();
    await page.getByLabel("X", { exact: true }).fill("60");
    await page.getByLabel("Tinggi").fill("700");
    await page.getByRole("button", { name: "Di atas overlay" }).click();
    await page.getByRole("button", { name: "+ Tambah slot" }).click();
    await expect(page.getByRole("button", { name: "Slot 5", exact: true })).toBeVisible();
    // Geser slot 5 dengan mouse: 100 px layar ke kanan = 100/scale px kanvas.
    const box = await page.getByRole("button", { name: "Slot 5", exact: true }).boundingBox();
    if (!box) throw new Error("slot 5");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();

    // Overlay salah ukuran ditolak, ukuran benar diterima.
    await page.getByLabel("Overlay PNG").setInputFiles({
      name: "kecil.png",
      mimeType: "image/png",
      buffer: png(10, 10),
    });
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Overlay harus PNG 1200×1800 px");
    await page.getByLabel("Overlay PNG").setInputFiles({
      name: "ov.png",
      mimeType: "image/png",
      buffer: png(1200, 1800),
    });
    await page.getByRole("button", { name: "+ Tambah teks" }).click();
    await page.getByLabel("Isi teks").fill("Terima kasih · {date}");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · versi 2");
    await page.screenshot({ path: "test-results/admin-template-editor.png", fullPage: true });
    // Preview = engine booth: pojok slot 1 berisi foto contoh ungu (#CEC8F6), bukan kanvas kosong.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const c = document.querySelector("canvas");
          const g = c?.getContext("2d");
          if (!c || !g) return "";
          const [r, gr, b] = g.getImageData(
            Math.round(((60 + 540 * 0.15) / 1200) * c.width),
            Math.round(((40 + 700 * 0.15) / 1800) * c.height),
            1,
            1,
          ).data;
          return `${r},${gr},${b}`;
        }),
      )
      .toBe("206,200,246");

    // Pakai di event.
    await page.goto("/admin");
    await page.getByRole("button", { name: "+ Buat Event" }).click();
    await page.getByPlaceholder(/Nama event/).fill(evName);
    await page.getByLabel("Tanggal event").fill("2026-10-12");
    await page.getByRole("button", { name: "Buat", exact: true }).click();
    await page.getByRole("group", { name: "Layout", exact: true }).getByText(tplName).click();
    await page.getByLabel(dev?.name ?? "").check();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · bundle v2");

    const auth = { Authorization: `Bearer ${token}` };
    const { events } = await (await request.get("/api/booth/events", { headers: auth })).json();
    const ev = events.find((e: { name: string }) => e.name === evName);
    const m = await (
      await request.get(`/api/booth/events/${ev.id}/bundle`, { headers: auth })
    ).json();
    const layout = m.config.layout;
    expect(layout).toMatchObject({ paper: "4R", version: 2, overlay: { assetId: "ov" } });
    expect(layout.slots).toHaveLength(5);
    expect(layout.slots[0]).toMatchObject({ x: 60, h: 700, z: "above_overlay" });
    expect(layout.slots[4].x).toBeGreaterThan(300 + 150);
    expect(layout.texts.at(-1).value).toBe("Terima kasih · {date}");
    expect(m.config.assets).toEqual({ ov: "ov.png" });
    const file = await fetch(m.files[0].url);
    expect(sha(new Uint8Array(await file.arrayBuffer()))).toBe(m.files[0].sha256);

    // Versi baru template tidak mengubah event sampai pengaturannya disimpan ulang.
    const { data: tpl } = await db.from("layouts").select("id").eq("name", tplName).single();
    await page.goto(`/admin/templates/${tpl?.id}`);
    await page.getByRole("button", { name: "Hapus overlay" }).click();
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toContainText("Tersimpan · versi 3");
    const { data: e2 } = await db.from("events").select("settings").eq("id", ev.id).single();
    expect(e2?.settings).toMatchObject({ template: { layoutVersion: 2 } });
    await page.goto(`/admin/events/${ev.id}/settings`);
    await expect(page.getByText("Event memakai v2. Simpan untuk memakai v3.")).toBeVisible();
  } finally {
    await db.from("events").delete().eq("name", evName);
    const { data: l } = await db.from("layouts").select("id").eq("name", tplName).maybeSingle();
    if (l) {
      await db.from("layout_versions").delete().eq("layout_id", l.id);
      await db.from("layouts").delete().eq("id", l.id);
    }
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await u.cleanup();
  }
});
