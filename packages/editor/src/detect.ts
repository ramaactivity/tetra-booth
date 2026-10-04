/**
 * Deteksi slot foto dari overlay PNG (#161): area transparan (alpha < `threshold`) yang tersambung
 * (4-arah) jadi satu slot berbentuk kotak pembatasnya. Overlay digambar di atas foto, jadi sudut
 * membulat/bentuk lain cukup kotak pembatas. Area kecil (< `minArea` × kanvas) dan area yang menyentuh
 * keempat tepi (latar luar transparan, bukan lubang foto) diabaikan.
 * Urutan: baris atas ke bawah, kiri ke kanan dalam satu baris.
 */
export type DetectedRect = { x: number; y: number; w: number; h: number };

export function detectSlots(
  /** Data RGBA (ImageData.data) ukuran `width`×`height`. */
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  { threshold = 128, minArea = 0.02, pad = 2 } = {},
): DetectedRect[] {
  const n = width * height;
  // 1 = transparan & belum dikunjungi.
  const open = new Uint8Array(n);
  for (let i = 0; i < n; i++) open[i] = (rgba[i * 4 + 3] ?? 255) < threshold ? 1 : 0;
  const stack = new Int32Array(n);
  let top = 0;
  const visit = (q: number) => {
    if (!open[q]) return;
    open[q] = 0;
    stack[top++] = q;
  };
  const found: DetectedRect[] = [];
  for (let start = 0; start < n; start++) {
    if (!open[start]) continue;
    visit(start);
    let count = 0;
    let x0 = width;
    let y0 = height;
    let x1 = 0;
    let y1 = 0;
    while (top) {
      const p = stack[--top] as number;
      const x = p % width;
      const y = (p - x) / width;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0) visit(p - 1);
      if (x < width - 1) visit(p + 1);
      if (y > 0) visit(p - width);
      if (y < height - 1) visit(p + width);
    }
    if (count < minArea * n) continue;
    if (x0 === 0 && y0 === 0 && x1 === width - 1 && y1 === height - 1) continue;
    // Sedikit melebar supaya tepi antialias overlay tidak menyisakan garis kosong di atas foto.
    const x = Math.max(0, x0 - pad);
    const y = Math.max(0, y0 - pad);
    found.push({
      x,
      y,
      w: Math.min(width, x1 + 1 + pad) - x,
      h: Math.min(height, y1 + 1 + pad) - y,
    });
  }
  // Baris: slot berikutnya masuk baris yang sama kalau atasnya di atas pertengahan slot pertama baris itu.
  found.sort((a, b) => a.y - b.y);
  const rows: DetectedRect[][] = [];
  for (const r of found) {
    const row = rows.at(-1);
    const head = row?.[0];
    if (row && head && r.y < head.y + head.h / 2) row.push(r);
    else rows.push([r]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.x - b.x));
}
