import { describe, expect, it } from "vitest";
import { hexToRgb, keyColor, suggestKeyColor } from "./chroma";
import { detectSlots } from "./detect";

const Y = "#ffde59";
/** Kanvas w×h warna `bg`, dengan kotak [x, y, w, h, hex]. */
const img = (
  w: number,
  h: number,
  bg: string,
  boxes: [number, number, number, number, string][],
) => {
  const d = new Uint8ClampedArray(w * h * 4);
  const put = (x: number, y: number, hex: string) => {
    const [r, g, b] = hexToRgb(hex);
    d.set([r, g, b, 255], (y * w + x) * 4);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(x, y, bg);
  for (const [bx, by, bw, bh, hex] of boxes)
    for (let y = by; y < by + bh; y++) for (let x = bx; x < bx + bw; x++) put(x, y, hex);
  return d;
};
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) =>
  Array.from(d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));

describe("keyColor", () => {
  it("area penanda jadi transparan, warna lain & pulau QR di dalamnya tetap", () => {
    // Frame putih, kotak kuning 20..79, QR hitam 60..69 di dalam area kuning, teks pink di luar.
    const d = img(100, 100, "#ffffff", [
      [20, 20, 60, 60, Y],
      [60, 60, 10, 10, "#000000"],
      [5, 90, 10, 5, "#e8836f"],
    ]);
    // Noise JPEG di area kuning.
    d.set([250, 226, 80, 255], (40 * 100 + 40) * 4);
    const cleared = keyColor(d, 100, 100, { color: Y });
    expect(cleared).toBe(60 * 60 - 100);
    expect(px(d, 100, 40, 40)[3]).toBe(0);
    expect(px(d, 100, 30, 30)[3]).toBe(0);
    expect(px(d, 100, 65, 65)).toEqual([0, 0, 0, 255]);
    expect(px(d, 100, 10, 92)).toEqual([232, 131, 111, 255]);
    expect(px(d, 100, 5, 5)).toEqual([255, 255, 255, 255]);
    // Lubang dengan pulau QR tetap satu slot = kotak pembatas lubang.
    expect(detectSlots(d, 100, 100, { pad: 0 })).toEqual([{ x: 20, y: 20, w: 60, h: 60 }]);
  });

  it("tepi antialias setengah transparan dan tanpa sisa kuning", () => {
    // Kolom 50 = campuran 50% kuning + hitam, sisanya kuning (kiri) / hitam (kanan).
    const d = img(100, 10, "#000000", [[0, 0, 50, 10, Y]]);
    const [r, g, b] = hexToRgb(Y);
    for (let y = 0; y < 10; y++) d.set([r / 2, g / 2, b / 2, 255], (y * 100 + 50) * 4);
    keyColor(d, 100, 10, { color: Y });
    const [er, eg, eb, ea] = px(d, 100, 50, 5) as [number, number, number, number];
    // Setengah campuran = setengah transparan; warna = hitam asli (kuning dilepas).
    expect(Math.abs(ea - 128)).toBeLessThan(8);
    expect(er + eg + eb).toBeLessThan(15);
    expect(px(d, 100, 49, 5)[3]).toBe(0);
    expect(px(d, 100, 52, 5)).toEqual([0, 0, 0, 255]);
  });

  it("bintik kecil warna penanda di bagian lain desain tetap opaque", () => {
    // Kotak foto kuning besar + bunga kuning 6×6 (0,36% < 2%) di pojok + titik teks 1 px.
    const d = img(100, 100, "#ffffff", [
      [20, 20, 60, 60, Y],
      [2, 88, 6, 6, Y],
      [95, 5, 1, 1, Y],
    ]);
    expect(keyColor(d, 100, 100, { color: Y })).toBe(60 * 60);
    expect(px(d, 100, 50, 50)[3]).toBe(0);
    expect(px(d, 100, 4, 90)).toEqual([...hexToRgb(Y), 255]);
    expect(px(d, 100, 95, 5)).toEqual([...hexToRgb(Y), 255]);
  });

  it("tanpa warna cocok = tidak berubah", () => {
    const d = img(10, 10, "#ffffff", []);
    expect(keyColor(d, 10, 10, { color: Y })).toBe(0);
    expect(px(d, 10, 3, 3)).toEqual([255, 255, 255, 255]);
  });
});

describe("suggestKeyColor", () => {
  it("warna jenuh terbesar, bukan latar frame di tepi", () => {
    // Latar pink (jenuh, lebih luas dari kuning) menyentuh tepi; kuning di tengah.
    const d = img(100, 100, "#f7a8c0", [[30, 30, 40, 40, Y]]);
    expect(suggestKeyColor(d, 100, 100)).toBe(Y);
  });
  it("latar putih: kuning", () => {
    expect(suggestKeyColor(img(50, 50, "#ffffff", [[10, 10, 20, 20, "#00ff00"]]), 50, 50)).toBe(
      "#00ff00",
    );
  });
});

it("cepat untuk kanvas 1200×1800", () => {
  const d = img(1200, 1800, "#ffffff", [[100, 100, 1000, 1400, Y]]);
  const t = performance.now();
  keyColor(d, 1200, 1800, { color: Y });
  suggestKeyColor(d, 1200, 1800);
  expect(performance.now() - t).toBeLessThan(1500);
});
