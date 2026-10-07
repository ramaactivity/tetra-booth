/**
 * Chroma key (#163): owner mengisi kotak foto dengan satu warna penanda (mis. kuning) di Canva/Photoshop,
 * warna itu dibuat transparan di sini, lalu `detectSlots` membaca lubangnya.
 *
 * Jarak warna = jarak Euclid RGB dalam persen dari jarak maksimum (hitam↔putih = 100).
 * - Jarak < `tolerance` = transparan, hanya untuk area cocok tersambung ≥ `minArea` kanvas (kotak foto); bintik
 *   kecil warna sama di bagian lain desain tetap opaque.
 * - Piksel tepi (≤ 2 px dari area transparan) = campuran antialias P = a·F + (1 − a)·K. F = tetangga yang
 *   lebih jauh dari penanda dan paling pas dengan garis K→F; alpha = a, warna = F hasil unmix, supaya tidak
 *   ada pinggiran kuning di atas foto. Tanpa tetangga seperti itu (piksel itu sendiri warna asli) = opaque;
 *   bila tidak ada F yang pas, alpha naik linear dari `tolerance` ke `tolerance + softness`.
 * Warna serupa yang jauh dari area penanda (> 2 px) tidak disentuh.
 */
export type KeyOptions = {
  color: string;
  tolerance?: number;
  softness?: number;
  /** Area cocok tersambung terkecil yang dihapus, bagian dari kanvas (bawaan 2%, sama dengan detectSlots). */
  minArea?: number;
};

export const DEFAULT_TOLERANCE = 12;
const MAX = Math.sqrt(3 * 255 * 255);
const EDGE = 2;

export const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", "").slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = (r: number, g: number, b: number) =>
  `#${((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1)}`;

/** Ubah `data` (RGBA, ukuran `width`×`height`) di tempat. Hasil: jumlah piksel yang jadi transparan penuh. */
export function keyColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  { color, tolerance = DEFAULT_TOLERANCE, softness = 8, minArea = 0.02 }: KeyOptions,
): number {
  const [kr, kg, kb] = hexToRgb(color);
  const t = (tolerance / 100) * MAX;
  const s = Math.max(1, (softness / 100) * MAX);
  const n = width * height;
  const dist = new Float32Array(n);
  // near = 1 untuk piksel dalam jarak EDGE dari piksel yang terhapus (dilatasi kotak terpisah x lalu y).
  const near = new Uint8Array(n);
  // open = 1: cocok warna & belum dikunjungi.
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d = Math.hypot((data[o] ?? 0) - kr, (data[o + 1] ?? 0) - kg, (data[o + 2] ?? 0) - kb);
    dist[i] = d;
    if (d < t) open[i] = 1;
  }
  // Hanya area cocok yang tersambung (4-arah) dan cukup besar untuk slot foto (≥ minArea kanvas, sama dengan
  // detectSlots) yang dihapus; bintik warna sama di bagian lain desain (bunga, teks) tetap utuh.
  let cleared = 0;
  const comp = new Int32Array(n);
  for (let start = 0; start < n; start++) {
    if (!open[start]) continue;
    open[start] = 0;
    comp[0] = start;
    let size = 1;
    for (let h = 0; h < size; h++) {
      const p = comp[h] as number;
      const x = p % width;
      for (const q of [
        x > 0 ? p - 1 : -1,
        x < width - 1 ? p + 1 : -1,
        p - width,
        p + width < n ? p + width : -1,
      ])
        if (q >= 0 && open[q]) {
          open[q] = 0;
          comp[size++] = q;
        }
    }
    if (size < minArea * n) continue;
    for (let h = 0; h < size; h++) {
      const p = comp[h] as number;
      data[p * 4 + 3] = 0;
      near[p] = 1;
    }
    cleared += size;
  }
  if (!cleared) return 0;
  const row = new Uint8Array(n);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (let k = Math.max(0, x - EDGE); k <= Math.min(width - 1, x + EDGE) && !v; k++)
        v = near[y * width + k] ?? 0;
      row[y * width + x] = v;
    }
  const src = data.slice();
  const fit = 0.08 * MAX; // sisa (residu) campuran yang masih dianggap pas: noise JPEG
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const d = dist[i] ?? 0;
      if (d < t) continue;
      let v = 0;
      for (let k = Math.max(0, y - EDGE); k <= Math.min(height - 1, y + EDGE) && !v; k++)
        v = row[k * width + x] ?? 0;
      if (!v) continue;
      const o = i * 4;
      const [ur, ug, ub] = [(src[o] ?? 0) - kr, (src[o + 1] ?? 0) - kg, (src[o + 2] ?? 0) - kb];
      // Warna asli F: tetangga (≤ EDGE px) yang lebih jauh dari penanda dan paling pas dengan
      // P = a·F + (1 − a)·K. Di antara yang pas, yang terjauh (paling murni).
      let a = Math.min(1, (d - t) / s);
      let best = -1;
      let bestRes = Number.POSITIVE_INFINITY;
      for (let qy = Math.max(0, y - EDGE); qy <= Math.min(height - 1, y + EDGE); qy++)
        for (let qx = Math.max(0, x - EDGE); qx <= Math.min(width - 1, x + EDGE); qx++) {
          const q = qy * width + qx;
          const dq = dist[q] ?? 0;
          if (dq <= d) continue;
          const p = q * 4;
          const [vr, vg, vb] = [(src[p] ?? 0) - kr, (src[p + 1] ?? 0) - kg, (src[p + 2] ?? 0) - kb];
          const m = Math.max(0, Math.min(1, (ur * vr + ug * vg + ub * vb) / (dq * dq)));
          const res = Math.hypot(ur - m * vr, ug - m * vg, ub - m * vb);
          const better =
            res <= fit ? bestRes > fit || dq > (dist[best] ?? 0) : res < bestRes && bestRes > fit;
          if (!better) continue;
          best = q;
          bestRes = res;
          if (res <= fit) a = m;
        }
      if (best >= 0 && bestRes > fit) continue; // tepi ke warna lain yang tidak pas: biarkan
      if (a >= 0.96) continue;
      data[o + 3] = Math.min(src[o + 3] ?? 255, Math.round(a * 255));
      // Lepas warna penanda (unmix); a kecil hampir transparan, hasil di-clamp Uint8ClampedArray.
      const m = Math.max(0.05, a);
      data[o] = kr + ur / m;
      data[o + 1] = kg + ug / m;
      data[o + 2] = kb + ub / m;
    }
  return cleared;
}

/**
 * Saran warna penanda: warna jenuh (bukan putih/abu/hitam) yang paling banyak, kecuali warna yang mendominasi
 * tepi gambar (biasanya latar frame, bukan kotak foto). Tidak ada warna jenuh = warna terbanyak yang bukan latar.
 * ponytail: histogram 4 bit/kanal + sampel ~250 rb piksel; cukup untuk isian rata, bukan segmentasi.
 */
export function suggestKeyColor(data: ArrayLike<number>, width: number, height: number): string {
  const n = width * height;
  const step = Math.max(1, Math.floor(n / 250_000));
  const count = new Uint32Array(4096);
  const sum = new Float64Array(4096 * 3);
  const binAt = (i: number) => {
    const o = i * 4;
    if ((data[o + 3] ?? 255) < 128) return -1;
    return (
      (((data[o] ?? 0) >> 4) << 8) | (((data[o + 1] ?? 0) >> 4) << 4) | ((data[o + 2] ?? 0) >> 4)
    );
  };
  for (let i = 0; i < n; i += step) {
    const b = binAt(i);
    if (b < 0) continue;
    count[b] = (count[b] ?? 0) + 1;
    for (let c = 0; c < 3; c++) sum[b * 3 + c] = (sum[b * 3 + c] ?? 0) + (data[i * 4 + c] ?? 0);
  }
  const border = new Uint32Array(4096);
  let edges = 0;
  const edge = (i: number) => {
    const b = binAt(i);
    if (b < 0) return;
    border[b] = (border[b] ?? 0) + 1;
    edges++;
  };
  for (let x = 0; x < width; x++) {
    edge(x);
    edge((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    edge(y * width);
    edge(y * width + width - 1);
  }
  const saturated = (b: number) => {
    const v = [b >> 8, (b >> 4) & 15, b & 15];
    return Math.max(...v) - Math.min(...v) >= 3;
  };
  const best = (ok: (b: number) => boolean) => {
    let top = -1;
    for (let b = 0; b < 4096; b++)
      if ((count[b] ?? 0) > 0 && ok(b) && (top < 0 || (count[b] ?? 0) > (count[top] ?? 0))) top = b;
    return top;
  };
  const b =
    [
      best((x) => saturated(x) && (border[x] ?? 0) < edges * 0.25),
      best(saturated),
      best((x) => (border[x] ?? 0) < edges * 0.25),
      best(() => true),
    ].find((x) => x >= 0) ?? -1;
  if (b < 0) return "#00ff00";
  const c = count[b] ?? 1;
  return rgbToHex((sum[b * 3] ?? 0) / c, (sum[b * 3 + 1] ?? 0) / c, (sum[b * 3 + 2] ?? 0) / c);
}
