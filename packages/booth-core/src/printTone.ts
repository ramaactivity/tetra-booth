import { cpuCanvas } from "@tetra/template-engine";

/**
 * Koreksi warna khusus lembar cetak (#208): printer (DNP RX1HS) mencetak lebih terang & pudar dari layar.
 * Disimpan per laptop (localStorage renderer) dan langsung berlaku tanpa buka ulang booth, supaya crew bisa
 * geser → Tes Cetak → bandingkan. Hanya lembar cetak (`strip.jpg`, tes cetak, cetak stage); layar & galeri tetap.
 */
export type PrintTone = { brightness: number; contrast: number; saturation: number };
export const PRINT_TONE_RANGE = 30;
const KEY = "tetra.printTone";
const ZERO: PrintTone = { brightness: 0, contrast: 0, saturation: 0 };
const clamp = (n: unknown) =>
  Math.max(-PRINT_TONE_RANGE, Math.min(PRINT_TONE_RANGE, Math.round(Number(n) || 0)));

export function loadPrintTone(): PrintTone {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<PrintTone>;
    return {
      brightness: clamp(v.brightness),
      contrast: clamp(v.contrast),
      saturation: clamp(v.saturation),
    };
  } catch {
    return ZERO;
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

/** Lembar cetak dengan koreksi warna printer; tanpa koreksi = kanvas yang sama. */
export function toneForPrint<C extends OffscreenCanvas>(sheet: C): C | OffscreenCanvas {
  const css = printToneCss(loadPrintTone());
  if (css === "none") return sheet;
  const out = cpuCanvas(sheet.width, sheet.height);
  const g = out.getContext("2d");
  if (!g) return sheet;
  g.filter = css;
  g.drawImage(sheet, 0, 0);
  return out;
}
