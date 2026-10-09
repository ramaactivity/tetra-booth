import { describe, expect, it } from "vitest";
import { loadPrintTone, PRINT_TONE_DEFAULT, sharpen } from "./printTone";

describe("printTone", () => {
  it("tanpa nilai tersimpan = bawaan DNP (lebih pekat & tajam)", () => {
    expect(loadPrintTone()).toEqual(PRINT_TONE_DEFAULT);
  });
  it("sharpen mempertegas tepi, area rata tidak berubah", () => {
    const w = 4;
    const h = 3;
    const data = new Uint8ClampedArray(w * h * 4);
    // kolom 0–1 gelap (50), kolom 2–3 terang (200)
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) data.fill(x < 2 ? 50 : 200, (y * w + x) * 4, (y * w + x) * 4 + 4);
    sharpen({ data, width: w, height: h }, 1);
    const at = (x: number, y: number) => data[(y * w + x) * 4];
    expect(at(1, 1)).toBeLessThan(50); // sisi gelap tepi makin gelap
    expect(at(2, 1)).toBeGreaterThan(200); // sisi terang tepi makin terang
  });
});
