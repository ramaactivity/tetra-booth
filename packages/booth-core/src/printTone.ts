import { cpuCanvas } from "@tetra/template-engine";

/**
 * Koreksi warna khusus lembar cetak (#208): printer (DNP RX1HS) mencetak lebih terang & pudar dari layar.
 * Disimpan per laptop (localStorage renderer) dan langsung berlaku tanpa buka ulang booth, supaya crew bisa
 * geser → Tes Cetak → bandingkan. Hanya lembar cetak (`strip.jpg`, tes cetak, cetak stage); layar & galeri tetap.
 */
export type PrintTone = {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Ketajaman (unsharp mask) 0–30: cetakan sublimasi lebih lembut dari layar. */
  sharpness: number;
};
export const PRINT_TONE_RANGE = 30;
const KEY = "tetra.printTone";
/**
 * Bawaan untuk printer sublimasi (DNP RX1HS, masukan Rama 9 Okt: cetakan lebih pudar, kurang tajam & dalam dari
 * layar): sedikit lebih gelap, kontras & saturasi naik, sedikit dipertajam. Laptop yang sudah menyimpan nilainya
 * sendiri tetap; kalibrasi akhir dengan Tes Cetak (#239).
 */
export const PRINT_TONE_DEFAULT: PrintTone = {
  brightness: -4,
  contrast: 12,
  saturation: 15,
  sharpness: 12,
};
const clamp = (n: unknown, lo = -PRINT_TONE_RANGE) =>
  Math.max(lo, Math.min(PRINT_TONE_RANGE, Math.round(Number(n) || 0)));

export function loadPrintTone(): PrintTone {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<PrintTone> | null;
    if (!v) return PRINT_TONE_DEFAULT;
    return {
      brightness: clamp(v.brightness),
      contrast: clamp(v.contrast),
      saturation: clamp(v.saturation),
      // Disimpan versi lama (tanpa ketajaman) = bawaan.
      sharpness: clamp(v.sharpness ?? PRINT_TONE_DEFAULT.sharpness, 0),
    };
  } catch {
    return PRINT_TONE_DEFAULT;
  }
}
export function savePrintTone(t: PrintTone) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {}
}

export const printToneCss = (t: PrintTone) =>
  t.brightness || t.contrast || t.saturation
    ? `brightness(${1 + t.brightness / 100}) contrast(${1 + t.contrast / 100}) saturate(${1 + t.saturation / 100})`
    : "none";

/**
 * Unsharp mask 3×3 di tempat: piksel + jumlah × (piksel − rata-rata tetangga). `amount` 0–1,2. Lembar 1200×1800
 * ±50 ms di renderer, sekali per cetak.
 */
export function sharpen(
  d: { data: Uint8ClampedArray; width: number; height: number },
  amount: number,
) {
  if (amount <= 0) return;
  const { data, width: w, height: h } = d;
  const src = new Uint8ClampedArray(data);
  const row = w * 4;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        const k = i + c;
        const at = (o: number) => src[k + o] ?? 0;
        const blur =
          (at(-row - 4) +
            at(-row) +
            at(-row + 4) +
            at(-4) +
            at(0) +
            at(4) +
            at(row - 4) +
            at(row) +
            at(row + 4)) /
          9;
        data[k] = at(0) + amount * (at(0) - blur);
      }
    }
}

/** Lembar cetak dengan koreksi warna printer; tanpa koreksi = kanvas yang sama. */
export function toneForPrint<C extends OffscreenCanvas>(sheet: C): C | OffscreenCanvas {
  const tone = loadPrintTone();
  const css = printToneCss(tone);
  if (css === "none" && !tone.sharpness) return sheet;
  const out = cpuCanvas(sheet.width, sheet.height);
  const g = out.getContext("2d");
  if (!g) return sheet;
  g.filter = css;
  g.drawImage(sheet, 0, 0);
  if (tone.sharpness) {
    const img = g.getImageData(0, 0, out.width, out.height);
    sharpen(img, (tone.sharpness / PRINT_TONE_RANGE) * 1.2);
    g.putImageData(img, 0, 0);
  }
  return out;
}
