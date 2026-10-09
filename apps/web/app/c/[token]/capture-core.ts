import { applyGuestPreset, guestPreset } from "@tetra/shared";

/** Pesan ke worker/fungsi proses jepretan (#209): frame 3:4 yang sudah dipotong + preset + teks stempel. */
export type ShotJob = {
  bmp: ImageBitmap;
  w: number;
  h: number;
  presetId: string;
  stamp: string | null;
};
export type ShotResult = { main: Blob; thumb: Blob };

type Canvas2D = OffscreenCanvas | HTMLCanvasElement;
const canvas = (w: number, h: number): Canvas2D => {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const jpeg = (c: Canvas2D, quality: number) =>
  "convertToBlob" in c
    ? c.convertToBlob({ type: "image/jpeg", quality })
    : new Promise<Blob>((ok, fail) =>
        c.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob"))), "image/jpeg", quality),
      );

/** xorshift: noise grain jauh lebih cepat dari Math.random di loop jutaan piksel. */
const fastRandom = () => {
  let s = 0x9e3779b9;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
};

/**
 * Proses satu jepretan: gambar frame, bakar preset (matriks + vignette + grain), stempel tanggal oranye, lalu
 * JPEG utama + thumb 480. Dipakai di Web Worker (UI tetap mulus) atau thread utama sebagai cadangan.
 */
export async function processShot({ bmp, w, h, presetId, stamp }: ShotJob): Promise<ShotResult> {
  const c = canvas(w, h);
  const ctx = c.getContext("2d", { willReadFrequently: true }) as
    | OffscreenCanvasRenderingContext2D
    | CanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const preset = guestPreset(presetId);
  if (preset.css !== "none" || preset.grain || preset.vignette) {
    const img = ctx.getImageData(0, 0, w, h);
    applyGuestPreset(img.data, w, h, preset, fastRandom());
    ctx.putImageData(img, 0, 0);
  }
  if (stamp) {
    const size = Math.round(h * 0.034);
    ctx.font = `600 ${size}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = "right";
    ctx.shadowColor = "rgba(255,120,30,.8)";
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = "#FF9A3C";
    ctx.fillText(stamp, w - size * 1.6, h - size * 1.4);
    ctx.shadowBlur = 0;
  }
  const t = canvas(Math.round((w * 480) / h), 480);
  (t.getContext("2d") as CanvasRenderingContext2D | null)?.drawImage(
    c as CanvasImageSource,
    0,
    0,
    t.width,
    t.height,
  );
  return { main: await jpeg(c, 0.88), thumb: await jpeg(t, 0.8) };
}
