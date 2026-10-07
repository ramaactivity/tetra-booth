import { cpuCanvas } from "@tetra/template-engine";
import { fit } from "./finalize";
import { applyLut, type Lut } from "./lut";

/**
 * Foto stage diperkecil ke sisi panjang `max`, lalu LUT `.cube` (#184, kalau ada), lalu warna preset (`ctx.filter`,
 * sama dengan pratinjau CSS).
 */
export function stageCanvas(img: ImageBitmap, max: number, filter: string, lut: Lut | null) {
  const { width, height } = fit(img.width, img.height, max);
  const c = cpuCanvas(width, height);
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas 2d tidak tersedia");
  g.imageSmoothingQuality = "high";
  if (!lut) {
    g.filter = filter;
    g.drawImage(img, 0, 0, width, height);
    return c;
  }
  g.drawImage(img, 0, 0, width, height);
  const px = g.getImageData(0, 0, width, height);
  applyLut(px.data, lut);
  g.putImageData(px, 0, 0);
  if (filter === "none") return c;
  const out = cpuCanvas(width, height);
  const o = out.getContext("2d");
  if (!o) throw new Error("canvas 2d tidak tersedia");
  o.filter = filter;
  o.drawImage(c, 0, 0);
  return out;
}

/** JPEG dari file kamera lewat `stageCanvas`. */
export async function renderJpeg(
  bytes: Uint8Array<ArrayBuffer>,
  max: number,
  filter: string,
  quality: number,
  lut: Lut | null = null,
) {
  const bmp = await createImageBitmap(new Blob([bytes]));
  try {
    const c = stageCanvas(bmp, max, filter, lut);
    return new Uint8Array(
      await (await c.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer(),
    );
  } finally {
    bmp.close();
  }
}
