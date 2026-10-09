import { z } from "zod";
import { filterCss, PHOTO_FILTER_IDS } from "./filters";

/**
 * Photo Stage (#178, docs/PLAN-PHOTO-STAGE.md): preset warna per event, diatur dari foto tes di laptop stage.
 * Filter yang sama dengan booth (#116) + penyesuaian; hasilnya satu string CSS filter yang dipakai pratinjau dan
 * pemrosesan foto (`ctx.filter`) — layar = hasil. LUT `.cube` menyusul (butuh proses piksel).
 */
export const StagePresetSchema = z.object({
  filter: z.enum(PHOTO_FILTER_IDS).default("normal"),
  /** -50…50 (%), 0 = asli. */
  brightness: z.number().int().min(-50).max(50).default(0),
  contrast: z.number().int().min(-50).max(50).default(0),
  saturation: z.number().int().min(-50).max(50).default(0),
  /** -50…50: positif makin hangat (kekuningan), negatif makin dingin (#187). */
  warmth: z.number().int().min(-50).max(50).default(0),
});
export type StagePreset = z.infer<typeof StagePresetSchema>;
export const DEFAULT_STAGE_PRESET: StagePreset = StagePresetSchema.parse({});

const f = (n: number) => Number(n.toFixed(2));
/** Preset → CSS filter; filter dulu, lalu penyesuaian. Semua nol + Normal = "none". */
export function stagePresetCss(p: StagePreset): string {
  const parts = [
    p.filter === "normal" ? "" : filterCss(p.filter),
    p.brightness ? `brightness(${f(1 + p.brightness / 100)})` : "",
    p.contrast ? `contrast(${f(1 + p.contrast / 100)})` : "",
    p.saturation ? `saturate(${f(1 + p.saturation / 100)})` : "",
    p.warmth > 0 ? `sepia(${f(p.warmth / 100)}) saturate(${f(1 + p.warmth / 200)})` : "",
    p.warmth < 0 ? `hue-rotate(${f(-p.warmth * 0.25)}deg) saturate(${f(1 + p.warmth / 400)})` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : "none";
}

/** Pemisah rombongan otomatis (detik); null = mati, rombongan baru hanya lewat tombol. */
export const STAGE_GAP = { default: 45, min: 15, max: 180 } as const;
/** Batas foto per rombongan (SessionUpsert.photoCount): lewat batas = rombongan baru otomatis. */
export const STAGE_MAX_SHOTS = 20;
/** Sisi panjang foto stage yang diunggah (sama dengan original booth). */
export const STAGE_PHOTO_PX = 2400;

type Box = { x: number; y: number; w: number; h: number };
/**
 * Mosaik 1–5 foto 3:2 di area W×H (desain B4): 1 tunggal, 2 berdampingan, 3 = 1 besar + 2 bertumpuk, 4 = 2×2,
 * 5 = 1 besar + 2×2. `f` = bingkai (padding 14 + border 3, dua sisi).
 */
export function tvMosaic(
  n: number,
  W: number,
  H: number,
  g: number,
): { w: number; h: number; boxes: Box[] } {
  const f = 34;
  const small = (u: number) => ({ cw: u + f, ch: u / 1.5 + f });
  let boxes: Box[];
  if (n <= 2) {
    const u = Math.min((W - (n - 1) * g) / n - f, (H - f) * 1.5);
    boxes = Array.from({ length: n }, (_, i) => ({
      x: i * (small(u).cw + g),
      y: 0,
      w: u,
      h: u / 1.5,
    }));
  } else if (n === 4) {
    const u = Math.min((W - g) / 2 - f, ((H - g) / 2 - f) * 1.5);
    const { cw, ch } = small(u);
    boxes = Array.from({ length: 4 }, (_, i) => ({
      x: (i % 2) * (cw + g),
      y: Math.floor(i / 2) * (ch + g),
      w: u,
      h: u / 1.5,
    }));
  } else {
    const cols = n === 3 ? 1 : 2;
    const dims = (u: number) => {
      const { cw, ch } = small(u);
      const bh = 2 * ch + g;
      const bw = (bh - f) * 1.5 + f;
      return { W: bw + g + cols * cw + (cols - 1) * g, H: bh, bw, bh, cw, ch };
    };
    let u = 1400;
    while (u > 40) {
      const d = dims(u);
      if (d.W <= W && d.H <= H) break;
      u -= 2;
    }
    const d = dims(u);
    boxes = [{ x: 0, y: 0, w: d.bw - f, h: d.bh - f }];
    for (let i = 1; i < n; i++) {
      const k = i - 1;
      boxes.push({
        x: d.bw + g + (k % cols) * (d.cw + g),
        y: Math.floor(k / cols) * (d.ch + g),
        w: u,
        h: u / 1.5,
      });
    }
  }
  const r = boxes.map((b) => ({
    x: Math.round(b.x),
    y: Math.round(b.y),
    w: Math.round(b.w),
    h: Math.round(b.h),
  }));
  return {
    w: Math.max(...r.map((b) => b.x + b.w + f)),
    h: Math.max(...r.map((b) => b.y + b.h + f)),
    boxes: r,
  };
}
