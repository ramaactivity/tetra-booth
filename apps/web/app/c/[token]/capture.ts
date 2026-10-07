import { applyGuestPreset, guestPreset, stampText } from "@tetra/shared";

const MAIN = 2048;
const THUMB = 480;

const toJpeg = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((ok, fail) =>
    c.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob"))), "image/jpeg", q),
  );

/**
 * Satu jepretan Guest Cam (#209, gaya Dazz): frame video dipotong tengah ke 3:4 potret (sisi panjang ≤ 2048),
 * preset film dibakar ke piksel (matriks warna + vignette + grain, bukan `ctx.filter` yang tidak konsisten di
 * iOS), stempel tanggal oranye opsional, lalu JPEG + thumb 480. Hasil tidak di-mirror (sama dengan booth).
 */
export async function capture(video: HTMLVideoElement, presetId: string, stamp: boolean) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  // Potong tengah ke 3:4 (lebar:tinggi).
  const cw = Math.min(vw, (vh * 3) / 4);
  const ch = (cw * 4) / 3;
  const k = Math.min(1, MAIN / ch);
  const w = Math.round(cw * k);
  const h = Math.round(ch * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, w, h);
  const preset = guestPreset(presetId);
  if (preset.css !== "none" || preset.grain || preset.vignette) {
    const img = ctx.getImageData(0, 0, w, h);
    applyGuestPreset(img.data, w, h, preset);
    ctx.putImageData(img, 0, 0);
  }
  if (stamp) {
    const size = Math.round(h * 0.034);
    ctx.font = `600 ${size}px "Geist Mono", ui-monospace, monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(255,120,30,.8)";
    ctx.shadowBlur = size * 0.5;
    ctx.fillStyle = "#FF9A3C";
    ctx.fillText(stampText(new Date()), w - size * 1.6, h - size * 1.4);
    ctx.shadowBlur = 0;
  }
  const t = document.createElement("canvas");
  t.width = Math.round((w * THUMB) / h);
  t.height = THUMB;
  t.getContext("2d")?.drawImage(c, 0, 0, t.width, t.height);
  return { main: await toJpeg(c, 0.88), thumb: await toJpeg(t, 0.8) };
}
