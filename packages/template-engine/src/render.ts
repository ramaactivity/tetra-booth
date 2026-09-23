import { type LayoutSlot, type LayoutSpec, LayoutSpecSchema, PRINT_CANVAS } from "@tetra/shared";
import type { CanvasLike, Ctx2D, ImageLike, RenderContext, RenderInputs } from "./types";

const get2d = (c: CanvasLike): Ctx2D => {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas 2d context tidak tersedia");
  return ctx;
};

/** Gambar `img` memenuhi kotak slot (cover, crop tengah), dengan rotasi opsional. */
const drawSlot = (ctx: Ctx2D, slot: LayoutSlot, img: ImageLike | undefined): void => {
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
  ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();
};

const substitute = (value: string, vars: RenderInputs["vars"]): string =>
  value.replace(
    /\{(event_name|date|custom)\}/g,
    (_, k: keyof RenderInputs["vars"]) => vars[k] ?? "",
  );

/** Render satu kanvas layout (ukuran `spec.canvas`). Urutan: background → slot bawah → overlay → slot atas → teks. */
const renderLayout = (spec: LayoutSpec, inputs: RenderInputs, ctx: RenderContext): CanvasLike => {
  const canvas = ctx.createCanvas(spec.canvas.width, spec.canvas.height);
  const c = get2d(canvas);

  if (spec.background?.color) {
    c.fillStyle = spec.background.color;
    c.fillRect(0, 0, canvas.width, canvas.height);
  }
  const bgImg = spec.background?.assetId ? inputs.assets[spec.background.assetId] : undefined;
  if (bgImg) c.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

  spec.slots.forEach((s, i) => {
    if (s.z === "below_overlay") drawSlot(c, s, inputs.photos[i]);
  });
  const overlay = spec.overlay ? inputs.assets[spec.overlay.assetId] : undefined;
  if (overlay) c.drawImage(overlay, 0, 0, canvas.width, canvas.height);
  spec.slots.forEach((s, i) => {
    if (s.z === "above_overlay") drawSlot(c, s, inputs.photos[i]);
  });

  for (const t of spec.texts) {
    c.save();
    c.font = `${t.size}px "${ctx.fontFamily(t.fontAssetId)}"`;
    c.fillStyle = t.color;
    c.textAlign = t.align;
    c.textBaseline = "top";
    const x = t.align === "center" ? t.x + t.w / 2 : t.align === "right" ? t.x + t.w : t.x;
    c.fillText(substitute(t.value, inputs.vars), x, t.y, t.w);
    c.restore();
  }
  return canvas;
};

/**
 * Render strip siap cetak (selalu 1200×1800 @300dpi).
 * `2x6x2`: satu strip 600×1800 dirender lalu digambar dua kali berdampingan. TSD §6.
 */
export const render = (spec: LayoutSpec, inputs: RenderInputs, ctx: RenderContext): CanvasLike => {
  const valid = LayoutSpecSchema.parse(spec);
  const layout = renderLayout(valid, inputs, ctx);
  if (valid.paper === "4R") return layout;

  const out = ctx.createCanvas(PRINT_CANVAS.width, PRINT_CANVAS.height);
  const c = get2d(out);
  c.drawImage(layout, 0, 0, layout.width, layout.height);
  c.drawImage(layout, layout.width, 0, layout.width, layout.height);
  return out;
};

/** SHA-256 dari piksel RGBA kanvas, untuk membandingkan hasil render antar platform. */
export const pixelHash = async (canvas: CanvasLike): Promise<string> => {
  const { data } = get2d(canvas).getImageData(0, 0, canvas.width, canvas.height);
  const buf = new Uint8Array(data.byteLength);
  buf.set(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};
