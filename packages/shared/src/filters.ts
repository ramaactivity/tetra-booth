/**
 * Filter foto pilihan tamu (DECISIONS #116): string CSS filter, dipakai template engine (`ctx.filter`, hanya ke
 * foto di slot) dan pratinjau di booth (`style.filter`) — satu definisi supaya layar = cetak = web.
 */
export const PHOTO_FILTERS = [
  { id: "normal", label: "Normal", css: "none" },
  { id: "bw", label: "Hitam Putih", css: "grayscale(1) contrast(1.1)" },
  { id: "warm", label: "Hangat", css: "sepia(0.25) saturate(1.2) brightness(1.03)" },
  { id: "faded", label: "Pudar", css: "contrast(0.85) brightness(1.08) saturate(0.8)" },
  { id: "vintage", label: "Vintage", css: "sepia(0.45) contrast(1.05) brightness(0.95)" },
] as const;
export type PhotoFilterId = (typeof PHOTO_FILTERS)[number]["id"];
export const PHOTO_FILTER_IDS = PHOTO_FILTERS.map((f) => f.id) as [
  PhotoFilterId,
  ...PhotoFilterId[],
];
export const filterCss = (id: string | null | undefined) =>
  PHOTO_FILTERS.find((f) => f.id === id)?.css ?? "none";

type Matrix = number[]; // 3×4 baris-mayor: [r·r, r·g, r·b, r·offset, g…, b…], nilai 0–1

const mul = (a: Matrix, b: Matrix): Matrix => {
  const A = (i: number) => a[i] ?? 0;
  const B = (i: number) => b[i] ?? 0;
  const out: Matrix = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 4; c++)
      out.push(
        A(r * 4) * B(c) +
          A(r * 4 + 1) * B(4 + c) +
          A(r * 4 + 2) * B(8 + c) +
          (c === 3 ? A(r * 4 + 3) : 0),
      );
  return out;
};

/** Matriks warna fungsi CSS filter (Filter Effects spec), atau null kalau tidak dikenal. */
const step = (fn: string, v: number): Matrix | null => {
  const k = 1 - v;
  switch (fn) {
    case "grayscale":
      return [
        0.2126 + 0.7874 * k,
        0.7152 - 0.7152 * k,
        0.0722 - 0.0722 * k,
        0,
        0.2126 - 0.2126 * k,
        0.7152 + 0.2848 * k,
        0.0722 - 0.0722 * k,
        0,
        0.2126 - 0.2126 * k,
        0.7152 - 0.7152 * k,
        0.0722 + 0.9278 * k,
        0,
      ];
    case "sepia":
      return [
        0.393 + 0.607 * k,
        0.769 - 0.769 * k,
        0.189 - 0.189 * k,
        0,
        0.349 - 0.349 * k,
        0.686 + 0.314 * k,
        0.168 - 0.168 * k,
        0,
        0.272 - 0.272 * k,
        0.534 - 0.534 * k,
        0.131 + 0.869 * k,
        0,
      ];
    case "saturate":
      return [
        0.213 + 0.787 * v,
        0.715 - 0.715 * v,
        0.072 - 0.072 * v,
        0,
        0.213 - 0.213 * v,
        0.715 + 0.285 * v,
        0.072 - 0.072 * v,
        0,
        0.213 - 0.213 * v,
        0.715 - 0.715 * v,
        0.072 + 0.928 * v,
        0,
      ];
    case "contrast":
      return [v, 0, 0, 0.5 - 0.5 * v, 0, v, 0, 0.5 - 0.5 * v, 0, 0, v, 0.5 - 0.5 * v];
    case "brightness":
      return [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    default:
      return null;
  }
};

const IDENTITY: Matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

/** String CSS filter → satu matriks gabungan (urutan sama dengan CSS: fungsi pertama diterapkan dulu). */
export const filterMatrix = (css: string): Matrix => {
  let m = IDENTITY;
  for (const [, fn = "", v] of css.matchAll(/(\w+)\(([\d.]+)\)/g)) {
    const s = step(fn, Number(v));
    if (s) m = mul(s, m);
  }
  return m;
};

/**
 * Terapkan filter foto ke piksel RGBA di tempat (Guest Cam, #197): `ctx.filter` kanvas tidak bisa diandalkan di
 * iOS Safari, jadi HP tamu memakai matriks yang sama dengan definisi CSS di atas.
 * ponytail: matriks digabung tanpa clamp antar langkah seperti CSS; beda hanya di warna yang sudah mentok 0/255.
 */
export function applyPhotoFilter(data: Uint8ClampedArray, id: string | null | undefined) {
  const css = filterCss(id);
  if (css === "none") return;
  const [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11] = filterMatrix(css).map((x, i) =>
    i % 4 === 3 ? x * 255 : x,
  ) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p] ?? 0;
    const g = data[p + 1] ?? 0;
    const b = data[p + 2] ?? 0;
    data[p] = m0 * r + m1 * g + m2 * b + m3;
    data[p + 1] = m4 * r + m5 * g + m6 * b + m7;
    data[p + 2] = m8 * r + m9 * g + m10 * b + m11;
  }
}
