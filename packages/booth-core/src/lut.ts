/**
 * LUT 3D `.cube` untuk Photo Stage (#184): format Adobe/Resolve (LUT_3D_SIZE, DOMAIN_MIN/MAX opsional, baris
 * "r g b" dengan r berubah paling cepat). Diterapkan trilinear ke piksel RGBA, setelah foto diperkecil.
 */
export type Lut = { size: number; data: Float32Array; min: number[]; max: number[] };

const MAX_SIZE = 65;

export function parseCube(text: string): Lut {
  let size = 0;
  let min = [0, 0, 0];
  let max = [1, 1, 1];
  const vals: number[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [k, ...rest] = line.split(/\s+/);
    if (k === "LUT_3D_SIZE") size = Number(rest[0]);
    else if (k === "DOMAIN_MIN") min = rest.map(Number);
    else if (k === "DOMAIN_MAX") max = rest.map(Number);
    else if (k === "LUT_1D_SIZE") throw new Error("LUT 1D belum didukung, pakai LUT 3D");
    else if (/^[-+.\d]/.test(k ?? "")) vals.push(Number(k), Number(rest[0]), Number(rest[1]));
  }
  if (!Number.isInteger(size) || size < 2 || size > MAX_SIZE)
    throw new Error("file .cube tidak valid (LUT_3D_SIZE)");
  if (vals.length !== size ** 3 * 3 || vals.some((v) => !Number.isFinite(v)))
    throw new Error("isi file .cube tidak lengkap");
  if (min.length !== 3 || max.length !== 3 || min.some((v, i) => (max[i] ?? 0) <= v))
    throw new Error("DOMAIN_MIN/MAX tidak valid");
  return { size, data: Float32Array.from(vals), min, max };
}

/** Terapkan LUT ke data RGBA (di tempat). Loop polos: dipakai untuk foto 2400 px (±4 juta piksel). */
export function applyLut(px: Uint8ClampedArray, lut: Lut) {
  const { size: n, data: d } = lut;
  const last = n - 1;
  const [r0min = 0, g0min = 0, b0min = 0] = lut.min;
  const [rmax = 1, gmax = 1, bmax = 1] = lut.max;
  const sr = last / (255 * (rmax - r0min));
  const sg = last / (255 * (gmax - g0min));
  const sb = last / (255 * (bmax - b0min));
  const or = (r0min * last) / (rmax - r0min);
  const og = (g0min * last) / (gmax - g0min);
  const ob = (b0min * last) / (bmax - b0min);
  const clamp = (v: number) => (v < 0 ? 0 : v > last ? last : v);
  const gs = 3 * n;
  const bs = 3 * n * n;
  for (let i = 0; i < px.length; i += 4) {
    const r = clamp((px[i] ?? 0) * sr - or);
    const g = clamp((px[i + 1] ?? 0) * sg - og);
    const b = clamp((px[i + 2] ?? 0) * sb - ob);
    const ri = r >= last ? last - 1 : r | 0;
    const gi = g >= last ? last - 1 : g | 0;
    const bi = b >= last ? last - 1 : b | 0;
    const fr = r - ri;
    const fg = g - gi;
    const fb = b - bi;
    const base = 3 * ri + gs * gi + bs * bi;
    for (let c = 0; c < 3; c++) {
      const o = base + c;
      const c00 = (d[o] ?? 0) * (1 - fr) + (d[o + 3] ?? 0) * fr;
      const c10 = (d[o + gs] ?? 0) * (1 - fr) + (d[o + gs + 3] ?? 0) * fr;
      const c01 = (d[o + bs] ?? 0) * (1 - fr) + (d[o + bs + 3] ?? 0) * fr;
      const c11 = (d[o + gs + bs] ?? 0) * (1 - fr) + (d[o + gs + bs + 3] ?? 0) * fr;
      px[i + c] = ((c00 * (1 - fg) + c10 * fg) * (1 - fb) + (c01 * (1 - fg) + c11 * fg) * fb) * 255;
    }
  }
}

/** LUT tersimpan per event di laptop stage (localStorage dibagi dengan jendela TV, origin sama). */
export const lutKey = (eventId: string) => `tetra.stage.lut.${eventId}`;
export type StoredLut = { name: string; text: string; at: number };
let memo: { key: string; at: number; lut: Lut } | null = null;
export function storedLut(key: string): (StoredLut & { lut: Lut }) | null {
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? "null") as StoredLut | null;
    if (!s) return null;
    if (memo?.key !== key || memo.at !== s.at) memo = { key, at: s.at, lut: parseCube(s.text) };
    return { ...s, lut: memo.lut };
  } catch {
    return null;
  }
}
