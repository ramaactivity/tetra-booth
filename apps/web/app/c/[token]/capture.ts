import { applyPhotoFilter } from "@tetra/shared";

const MAIN = 2400;
const THUMB = 480;

const toJpeg = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((ok, fail) =>
    c.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob"))), "image/jpeg", q),
  );

const sized = (w: number, h: number, max: number) => {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.round(w * k), Math.round(h * k)] as const;
};

/**
 * Satu jepretan Guest Cam (#197): frame video → JPEG utama (sisi panjang ≤ 2400) + thumb 480. Filter diterapkan
 * ke piksel (bukan `ctx.filter`, tidak konsisten di iOS). Hasil tidak di-mirror walau pratinjau kamera depan
 * di-mirror (sama dengan booth).
 * ponytail: resolusi = resolusi stream video (biasanya 1920×1080); ImageCapture full-res kalau perlu lebih tajam.
 */
export async function capture(video: HTMLVideoElement, filter: string) {
  const [w, h] = sized(video.videoWidth, video.videoHeight, MAIN);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(video, 0, 0, w, h);
  if (filter !== "normal") {
    const img = ctx.getImageData(0, 0, w, h);
    applyPhotoFilter(img.data, filter);
    ctx.putImageData(img, 0, 0);
  }
  const t = document.createElement("canvas");
  [t.width, t.height] = sized(w, h, THUMB);
  t.getContext("2d")?.drawImage(c, 0, 0, t.width, t.height);
  return { main: await toJpeg(c, 0.86), thumb: await toJpeg(t, 0.8) };
}
