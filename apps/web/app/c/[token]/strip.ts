import type { LayoutSpec } from "@tetra/shared";
import { browserContext, cpuCanvas, type ImageLike, renderPiece } from "@tetra/template-engine";

const FONT = "Geist Variable";
export type GuestDesign = {
  layout: LayoutSpec;
  assets: Record<string, string>;
  fonts: Record<string, string>;
};

const bitmap = (url: string) =>
  fetch(url)
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
    .then(createImageBitmap);

const jpeg = (c: OffscreenCanvas, quality: number) =>
  c.convertToBlob({ type: "image/jpeg", quality });

/**
 * Strip virtual Guest Cam (#197): foto tamu (sudah berfilter) ke desain utama event lewat template engine yang
 * sama dengan booth (aturan 2). Hasil = satu potong desain (seperti strip_web booth) + thumb 480.
 */
export async function renderStrip(
  d: GuestDesign,
  photoUrls: string[],
  vars: { event_name: string; date: string },
  qrUrl: string,
) {
  const assets: Record<string, ImageLike> = {};
  for (const [id, u] of Object.entries(d.assets)) {
    const img = await bitmap(u).catch(() => null);
    if (img) assets[id] = img;
  }
  const family: Record<string, string> = {};
  for (const [id, u] of Object.entries(d.fonts)) {
    const f = await new FontFace(`gc-${id}`, `url(${u})`).load().catch(() => null);
    if (f) {
      document.fonts.add(f);
      family[id] = `gc-${id}`;
    }
  }
  await document.fonts.load(`40px "${FONT}"`).catch(() => {});
  const photos = await Promise.all(photoUrls.map(bitmap));
  const piece = renderPiece(
    d.layout,
    { photos, assets, vars, qrUrl },
    { ...browserContext(FONT), fontFamily: (id) => family[id] ?? FONT },
  ) as unknown as OffscreenCanvas;
  const k = Math.min(1, 480 / Math.max(piece.width, piece.height));
  const t = cpuCanvas(Math.round(piece.width * k), Math.round(piece.height * k));
  t.getContext("2d")?.drawImage(piece, 0, 0, t.width, t.height);
  return { main: await jpeg(piece, 0.88), thumb: await jpeg(t as unknown as OffscreenCanvas, 0.8) };
}
