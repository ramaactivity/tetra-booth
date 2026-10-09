import {
  type LayoutSlot,
  type LayoutSpec,
  LayoutSpecSchema,
  type LayoutText,
  PRINT_CANVAS,
} from "@tetra/shared";
import QRCode from "qrcode";
import type { CanvasLike, Ctx2D, ImageLike, RenderContext, RenderInputs } from "./types";

/** URL contoh untuk QR di editor & pratinjau (panjang sama dengan link sesi asli, jadi kerapatan QR sama). */
export const SAMPLE_QR_URL = "https://booth.tetraphoto.com/s/AbCdEfGhIj";

/** QR sebagai kotak-kotak `fillRect` (tanpa gambar), tepi putih 2 modul, sisi total = `qr.size`. */
const drawQr = (c: Ctx2D, qr: NonNullable<LayoutSpec["qr"]>, url: string): void => {
  const m = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
  const n = m.size + 4;
  const cell = qr.size / n;
  c.save();
  c.fillStyle = qr.background ?? "#ffffff";
  c.fillRect(qr.x, qr.y, qr.size, qr.size);
  c.fillStyle = qr.color ?? "#1d1d1b";
  for (let y = 0; y < m.size; y++)
    for (let x = 0; x < m.size; x++)
      // +0.5 px menutup celah antialias di antara kotak.
      if (m.get(y, x))
        c.fillRect(qr.x + (x + 2) * cell, qr.y + (y + 2) * cell, cell + 0.5, cell + 0.5);
  c.restore();
};

const get2d = (c: CanvasLike): Ctx2D => {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context tidak tersedia");
  return ctx;
};

/** Gambar `img` memenuhi kotak slot (cover, crop tengah), dengan rotasi opsional. */
const drawSlot = (
  ctx: Ctx2D,
  slot: LayoutSlot,
  img: ImageLike | undefined,
  filter?: string,
): void => {
  if (!img) return;
  const scale = Math.max(slot.w / img.width, slot.h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.save();
  ctx.translate(slot.x + slot.w / 2, slot.y + slot.h / 2);
  if (slot.rotation) ctx.rotate((slot.rotation * Math.PI) / 180);
  ctx.beginPath();
  ctx.rect(-slot.w / 2, -slot.h / 2, slot.w, slot.h);
  ctx.clip();
  // Foto kamera (5184 px) diperkecil ±4× ke slot: kualitas "low" bawaan membuat foto bergerigi/kurang tajam (W-031).
  // Hanya saat memperkecil: filter "high" Skia beda tipis antar platform, hash fixture (foto seukuran slot) tetap sama.
  if (scale < 1) ctx.imageSmoothingQuality = "high";
  if (filter && filter !== "none") ctx.filter = filter;
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
};

const MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

/**
 * Bentuk lain `{date}` untuk frame Snapbook: `{date_iso}` 2026-10-10, `{date_long}` 10 Oktober 2026, `{date_dot}`
 * 10.10.26. Diturunkan dari `vars.date` (ISO atau "10 Oktober 2026", yang dikirim booth/HP); tak terbaca = apa adanya.
 */
export const dateVars = (date = "") => {
  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const long = date.match(/^(\d{1,2}) (\p{L}+) (\d{4})$/u);
  const m = long ? MONTHS.findIndex((x) => x.toLowerCase() === long[2]?.toLowerCase()) + 1 : 0;
  const [y, mo, d] = iso
    ? iso.slice(1).map(Number)
    : long && m
      ? [Number(long[3]), m, Number(long[1])]
      : [];
  if (!y || !mo || !d) return { date_iso: date, date_long: date, date_dot: date };
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date_iso: `${y}-${p(mo)}-${p(d)}`,
    date_long: `${d} ${MONTHS[mo - 1]} ${y}`,
    date_dot: `${p(d)}.${p(mo)}.${p(y % 100)}`,
  };
};

const substitute = (value: string, vars: RenderInputs["vars"]): string => {
  const all: Record<string, string | undefined> = { ...dateVars(vars.date), ...vars };
  return value.replace(
    /\{(event_name|date|custom|date_iso|date_long|date_dot)\}/g,
    (_, k) => all[k] ?? "",
  );
};

const drawText = (c: Ctx2D, t: LayoutText, inputs: RenderInputs, ctx: RenderContext): void => {
  c.save();
  c.font = `${t.size}px "${ctx.fontFamily(t.fontAssetId)}"`;
  c.fillStyle = t.color;
  c.textAlign = t.align;
  c.textBaseline = "top";
  const x = t.align === "center" ? t.x + t.w / 2 : t.align === "right" ? t.x + t.w : t.x;
  c.fillText(substitute(t.value, inputs.vars), x, t.y, t.w);
  c.restore();
};

type Z = LayoutSlot["z"];
/**
 * Urutan gambar satu kelompok z: `order` bila ada, selain itu urutan array dengan slot sebelum teks
 * (perilaku lama: semua teks di atas overlay).
 */
const layer = (spec: LayoutSpec, z: Z) =>
  [
    ...spec.slots.map((s, i) => ({ z: s.z, key: s.order ?? i, i, slot: true })),
    ...spec.texts.map((t, i) => ({
      z: t.z ?? "above_overlay",
      key: t.order ?? 10_000 + i,
      i,
      slot: false,
    })),
  ]
    .filter((l) => l.z === z)
    .sort((a, b) => a.key - b.key);

/** Render satu kanvas layout (ukuran `spec.canvas`). Urutan: background → kelompok bawah → overlay → kelompok atas. */
const renderLayout = (
  spec: LayoutSpec,
  inputs: RenderInputs,
  ctx: RenderContext,
  scale = 1,
): CanvasLike => {
  const canvas = ctx.createCanvas(
    Math.round(spec.canvas.width * scale),
    Math.round(spec.canvas.height * scale),
  );
  const c = get2d(canvas);
  if (scale !== 1) c.scale(scale, scale);

  const { width: W, height: H } = spec.canvas;
  if (spec.background?.color) {
    c.fillStyle = spec.background.color;
    c.fillRect(0, 0, W, H);
  }
  const bgImg = spec.background?.assetId ? inputs.assets[spec.background.assetId] : undefined;
  if (bgImg) c.drawImage(bgImg, 0, 0, W, H);

  const draw = (z: Z) => {
    for (const l of layer(spec, z)) {
      const slot = l.slot ? spec.slots[l.i] : undefined;
      const text = l.slot ? undefined : spec.texts[l.i];
      if (slot) drawSlot(c, slot, inputs.photos[l.i], inputs.photoFilter);
      if (text) drawText(c, text, inputs, ctx);
    }
  };
  draw("below_overlay");
  const ov = spec.overlay;
  const overlay = ov ? inputs.assets[ov.assetId] : undefined;
  if (ov && overlay) c.drawImage(overlay, ov.x ?? 0, ov.y ?? 0, ov.w ?? W, ov.h ?? H);
  draw("above_overlay");
  if (spec.qr) drawQr(c, spec.qr, inputs.qrUrl ?? SAMPLE_QR_URL);
  return canvas;
};

/**
 * Render satu potong desain (ukuran `spec.canvas` × `scale`, orientasi asli): untuk layar, web, dan editor.
 * `scale` > 1 = versi web yang lebih tajam (foto & teks digambar ulang, bukan diperbesar); cetak selalu 1.
 */
export const renderPiece = (
  spec: LayoutSpec,
  inputs: RenderInputs,
  ctx: RenderContext,
  scale = 1,
) => renderLayout(LayoutSpecSchema.parse(spec), inputs, ctx, scale);

/**
 * Lembar cetak 1200×1800 dari satu potong (DECISIONS #78). 4R = potong itu sendiri; 2R & polaroid =
 * dua potong (portrait berdampingan, landscape bertumpuk). Lembar yang melebar diputar 90° searah
 * jarum jam, jadi garis potong 2R tetap di tengah dan printer selalu menerima 1200×1800. TSD §6.
 * `second` (#207): potong kedua berbeda (sisi kanan/bawah) untuk polaroid/2R "dua sisi berbeda".
 */
export const toSheet = (
  spec: LayoutSpec,
  piece: CanvasLike,
  ctx: RenderContext,
  second?: CanvasLike,
): CanvasLike => {
  const { width: w, height: h } = piece;
  const two = spec.paper !== "4R";
  const side = w < h; // dua potong portrait berdampingan
  const sw = two && side ? w * 2 : w;
  const sh = two && !side ? h * 2 : h;
  if (!two && sw === PRINT_CANVAS.width) return piece;
  const out = ctx.createCanvas(PRINT_CANVAS.width, PRINT_CANVAS.height);
  const c = get2d(out);
  c.save();
  if (sw > sh) {
    c.translate(PRINT_CANVAS.width, 0);
    c.rotate(Math.PI / 2);
  }
  c.drawImage(piece, 0, 0, w, h);
  if (two) c.drawImage(second ?? piece, side ? w : 0, side ? 0 : h, w, h);
  c.restore();
  return out;
};

/** Render lembar siap cetak (selalu 1200×1800 @300dpi). */
export const render = (spec: LayoutSpec, inputs: RenderInputs, ctx: RenderContext): CanvasLike =>
  toSheet(spec, renderPiece(spec, inputs, ctx), ctx);

/** SHA-256 dari piksel RGBA kanvas, untuk membandingkan hasil render antar platform. */
export const pixelHash = async (canvas: CanvasLike): Promise<string> => {
  const { data } = get2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  const buf = new Uint8Array(data.byteLength);
  buf.set(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};
