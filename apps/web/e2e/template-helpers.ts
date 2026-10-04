import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Wizard Buat Template (#160) dari halaman Template: mode → kertas & arah → mulai dari → nama → (event) → editor.
 * Bawaan: mode tab aktif, 4R portrait, tata letak 4R Grid (tab "Tata letak cepat"), tanpa pasang ke event.
 * `upload` = tab "Upload desain" (#161) dengan file ini, lalu tunggu pratinjau slot terdeteksi.
 */
export async function createTemplateViaWizard(
  page: Page,
  o: {
    name: string;
    mode?: "Event" | "Photobox";
    paper?: "Strip 2R" | "Foto 4R" | "Polaroid";
    landscape?: boolean;
    /** Nama kartu tata letak / template sumber. */
    source?: RegExp;
    upload?: { name: string; mimeType: string; buffer: Buffer };
    /** Setelah pratinjau upload tampil (mis. cek langkah hapus warna). */
    onUpload?: (dlg: Locator) => Promise<void>;
    /** Nama event + harga (photobox) untuk langkah Pasang ke event. */
    event?: { name: string; price?: string };
    /** Simpan screenshot tiap langkah ke test-results/<shot>-<n>.png. */
    shot?: string;
  },
) {
  let n = 0;
  const snap = async () => {
    if (o.shot) await page.screenshot({ path: `test-results/${o.shot}-${++n}.png` });
  };
  await page.getByRole("button", { name: "Buat Template" }).click();
  const dlg = page.getByRole("dialog", { name: "Buat template" });
  if (o.mode) await dlg.getByText(o.mode, { exact: true }).click();
  await snap();
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  if (o.paper) await dlg.getByText(o.paper, { exact: true }).click();
  if (o.landscape) await dlg.getByRole("button", { name: /^Landscape/ }).click();
  await snap();
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  if (o.upload) {
    await snap();
    await dlg.getByLabel("Desain PNG").setInputFiles(o.upload);
    await expect(dlg.getByRole("img", { name: "Pratinjau slot terdeteksi" })).toBeVisible();
    await o.onUpload?.(dlg);
  } else {
    await dlg.getByRole("button", { name: "Tata letak cepat" }).click();
    if (o.source) await dlg.getByRole("radio", { name: o.source }).check({ force: true });
    if (o.shot) await expect(dlg.locator("label img").first()).toBeVisible({ timeout: 15_000 });
  }
  await snap();
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  await dlg.getByLabel("Nama template").fill(o.name);
  await dlg.getByRole("button", { name: "Lanjut" }).click();
  if (o.event) {
    await dlg.getByRole("combobox", { name: "Pasang ke event" }).click();
    await page.getByRole("option", { name: new RegExp(o.event.name) }).click();
    if (o.event.price) await dlg.getByLabel("Harga paket (Rp)").fill(o.event.price);
  }
  await snap();
  await dlg.getByRole("button", { name: "Buat & buka editor" }).click();
  await expect(page.getByLabel("Nama template")).toHaveValue(o.name, { timeout: 30_000 });
}

/**
 * PNG desain uji (#161) dibuat di browser: latar opaque `fill`, lubang transparan `holes` [x, y, w, h, radius?].
 * Hasil siap untuk `setInputFiles`.
 */
export async function makePng(
  page: Page,
  w: number,
  h: number,
  holes: [number, number, number, number, number?][],
  name = "desain.png",
) {
  const b64 = await page.evaluate(
    async ([w, h, holes]) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
      g.fillStyle = "#f6c6d0";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1d1d1b";
      g.font = `bold ${Math.round(w / 13)}px sans-serif`;
      g.textAlign = "center";
      g.fillText("Andi & Sari", w / 2, h - h / 18);
      g.globalCompositeOperation = "destination-out";
      for (const [x, y, hw, hh, r] of holes) {
        g.beginPath();
        g.roundRect(x, y, hw, hh, r ?? 0);
        g.fill();
      }
      const bytes = new Uint8Array(
        await (await c.convertToBlob({ type: "image/png" })).arrayBuffer(),
      );
      let s = "";
      for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    },
    [w, h, holes] as const,
  );
  return { name, mimeType: "image/png", buffer: Buffer.from(b64, "base64") };
}

/**
 * JPG desain uji (#163) seperti ekspor Canva: latar putih, kotak foto diisi warna penanda kuning (membulat) dengan
 * kotak gelap kecil (mis. QR) di dalamnya dekat sudut, teks di bawah. `rect` = [x, y, w, h] kotak kuning.
 */
export async function makeJpg(
  page: Page,
  w: number,
  h: number,
  rect: [number, number, number, number],
  name = "desain.jpg",
) {
  const b64 = await page.evaluate(
    async ([w, h, [x, y, rw, rh]]) => {
      const c = new OffscreenCanvas(w, h);
      const g = c.getContext("2d") as OffscreenCanvasRenderingContext2D;
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ffde59";
      g.beginPath();
      g.roundRect(x, y, rw, rh, 48);
      g.fill();
      g.fillStyle = "#1d1d1b";
      g.fillRect(x + rw - 140, y + rh - 140, 100, 100);
      g.font = `bold ${Math.round(w / 13)}px sans-serif`;
      g.textAlign = "center";
      g.fillText("Andi & Sari", w / 2, h - h / 18);
      const bytes = new Uint8Array(
        await (await c.convertToBlob({ type: "image/jpeg", quality: 0.85 })).arrayBuffer(),
      );
      let s = "";
      for (const x of bytes) s += String.fromCharCode(x);
      return btoa(s);
    },
    [w, h, rect] as const,
  );
  return { name, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}
