import { describe, expect, it } from "vitest";
import { detectSlots } from "./detect";

/** RGBA opaque w×h dengan lubang transparan [x, y, w, h]. */
const png = (w: number, h: number, holes: [number, number, number, number][]) => {
  const d = new Uint8ClampedArray(w * h * 4).fill(255);
  for (const [hx, hy, hw, hh] of holes)
    for (let y = hy; y < hy + hh; y++)
      for (let x = hx; x < hx + hw; x++) d[(y * w + x) * 4 + 3] = 0;
  return d;
};

describe("detectSlots", () => {
  it("lubang jadi slot, urut atas→bawah lalu kiri→kanan, melebar pad", () => {
    // 2×2 grid, baris kanan sedikit lebih tinggi (y beda tipis) tetap satu baris.
    const d = png(100, 100, [
      [55, 12, 30, 30],
      [10, 10, 30, 30],
      [10, 55, 30, 30],
      [55, 55, 30, 30],
    ]);
    expect(detectSlots(d, 100, 100, { pad: 0 })).toEqual([
      { x: 10, y: 10, w: 30, h: 30 },
      { x: 55, y: 12, w: 30, h: 30 },
      { x: 10, y: 55, w: 30, h: 30 },
      { x: 55, y: 55, w: 30, h: 30 },
    ]);
    expect(detectSlots(d, 100, 100)[0]).toEqual({ x: 8, y: 8, w: 34, h: 34 });
  });

  it("abaikan area kecil, latar luar transparan, dan semi-transparan di atas ambang", () => {
    const d = png(100, 100, [
      [0, 0, 100, 5], // pinggiran luar (menyentuh keempat tepi bersama tiga lainnya)
      [0, 95, 100, 5],
      [0, 0, 5, 100],
      [95, 0, 5, 100],
      [20, 20, 5, 5], // 25 px < 2%
      [40, 40, 30, 30],
    ]);
    for (let i = 3; i < 100 * 4 * 10; i += 4) if (d[i] === 255) d[i] = 200; // opaque-ish
    expect(detectSlots(d, 100, 100, { pad: 0 })).toEqual([{ x: 40, y: 40, w: 30, h: 30 }]);
  });

  it("bentuk bulat/menyambung = satu kotak pembatas; tanpa lubang = kosong", () => {
    const d = png(100, 100, [
      [20, 20, 40, 10],
      [20, 20, 10, 40],
    ]);
    expect(detectSlots(d, 100, 100, { pad: 0 })).toEqual([{ x: 20, y: 20, w: 40, h: 40 }]);
    expect(detectSlots(png(50, 50, []), 50, 50)).toEqual([]);
  });
});

it("cepat untuk kanvas 1200×1800", () => {
  const d = new Uint8ClampedArray(1200 * 1800 * 4); // semua transparan: satu area raksasa
  const t = performance.now();
  expect(detectSlots(d, 1200, 1800)).toEqual([]);
  expect(performance.now() - t).toBeLessThan(1000);
});
