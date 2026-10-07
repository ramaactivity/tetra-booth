import { filterMatrix } from "./filters";

/**
 * Preset "kamera" Guest Cam (#209, gaya Dazz): nama film umum berbahasa Inggris. `css` dipakai pratinjau
 * (style.filter) dan sumber matriks piksel; grain & vignette dibakar ke piksel; `stamp` = stempel tanggal bawaan.
 * `body` = warna bodi ikon kamera di laci pilihan.
 */
export type GuestPreset = {
  id: string;
  name: string;
  css: string;
  grain: number;
  vignette: number;
  stamp: boolean;
  body: string;
};
const ORIGINAL: GuestPreset = {
  id: "original",
  name: "Original",
  css: "none",
  grain: 0,
  vignette: 0,
  stamp: false,
  body: "#EFEDE8",
};
export const GUEST_PRESETS: readonly GuestPreset[] = [
  ORIGINAL,
  {
    id: "gold",
    name: "Gold 200",
    css: "sepia(0.18) saturate(1.35) contrast(1.08) brightness(1.04)",
    grain: 0.18,
    vignette: 0.25,
    stamp: false,
    body: "#F8D98B",
  },
  {
    id: "portra",
    name: "Portra",
    css: "sepia(0.12) saturate(1.1) contrast(0.92) brightness(1.06)",
    grain: 0.12,
    vignette: 0.15,
    stamp: false,
    body: "#FCE3C6",
  },
  {
    id: "disposable",
    name: "Disposable",
    css: "saturate(1.3) contrast(1.15) brightness(1.05) sepia(0.08)",
    grain: 0.25,
    vignette: 0.35,
    stamp: true,
    body: "#8EDCCB",
  },
  {
    id: "ccd",
    name: "CCD",
    css: "saturate(1.15) contrast(1.12) brightness(1.08) hue-rotate(-8deg)",
    grain: 0.08,
    vignette: 0.1,
    stamp: true,
    body: "#D6EEF8",
  },
  {
    id: "instant",
    name: "Instant",
    css: "contrast(0.85) brightness(1.1) saturate(0.85) sepia(0.15)",
    grain: 0.1,
    vignette: 0.2,
    stamp: false,
    body: "#CEC8F6",
  },
  {
    id: "mono",
    name: "Mono",
    css: "grayscale(1) contrast(1.12) brightness(1.02)",
    grain: 0.22,
    vignette: 0.2,
    stamp: false,
    body: "#D6D3CC",
  },
  {
    id: "noir",
    name: "Noir",
    css: "grayscale(1) contrast(1.45) brightness(0.92)",
    grain: 0.28,
    vignette: 0.45,
    stamp: false,
    body: "#3A3936",
  },
  {
    id: "vintage",
    name: "Vintage",
    css: "sepia(0.45) contrast(1.05) brightness(0.95)",
    grain: 0.2,
    vignette: 0.35,
    stamp: false,
    body: "#E8836F",
  },
];
export const guestPreset = (id: string | null | undefined): GuestPreset =>
  GUEST_PRESETS.find((p) => p.id === id) ?? ORIGINAL;

/** "'26 10 07": stempel tanggal kamera sekali pakai. */
export const stampText = (d: Date) =>
  `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getDate()).padStart(2, "0")}`;

/**
 * Bakar preset ke piksel RGBA (w×h) di tempat: matriks warna CSS (sama dengan pratinjau), vignette (gelap ke
 * tepi), grain (noise luma). `rnd` bisa diganti di test supaya deterministik.
 */
export function applyGuestPreset(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  preset: GuestPreset,
  rnd: () => number = Math.random,
) {
  const flat = preset.css === "none";
  const m = flat ? [] : filterMatrix(preset.css).map((x, i) => (i % 4 === 3 ? x * 255 : x));
  const [
    m0 = 1,
    m1 = 0,
    m2 = 0,
    m3 = 0,
    m4 = 0,
    m5 = 1,
    m6 = 0,
    m7 = 0,
    m8 = 0,
    m9 = 0,
    m10 = 1,
    m11 = 0,
  ] = m;
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  const maxD = cx * cx + cy * cy || 1;
  const g = preset.grain * 40;
  const v = preset.vignette;
  if (flat && !g && !v) return;
  for (let y = 0; y < h; y++) {
    const dy = (y - cy) * (y - cy);
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      let r = data[p] ?? 0;
      let gg = data[p + 1] ?? 0;
      let b = data[p + 2] ?? 0;
      if (!flat) {
        const nr = m0 * r + m1 * gg + m2 * b + m3;
        const ng = m4 * r + m5 * gg + m6 * b + m7;
        b = m8 * r + m9 * gg + m10 * b + m11;
        r = nr;
        gg = ng;
      }
      if (v) {
        const k = 1 - v * (((x - cx) * (x - cx) + dy) / maxD) ** 1.5;
        r *= k;
        gg *= k;
        b *= k;
      }
      if (g) {
        const n = (rnd() - 0.5) * g;
        r += n;
        gg += n;
        b += n;
      }
      data[p] = r;
      data[p + 1] = gg;
      data[p + 2] = b;
    }
  }
}
