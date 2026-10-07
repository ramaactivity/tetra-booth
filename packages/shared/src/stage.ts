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
