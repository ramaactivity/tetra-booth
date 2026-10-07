import { describe, expect, it } from "vitest";
import { applyLut, parseCube } from "./lut";

const cube = (n: number, f: (r: number, g: number, b: number) => number[]) => {
  const rows = [`TITLE "uji"`, `LUT_3D_SIZE ${n}`];
  for (let b = 0; b < n; b++)
    for (let g = 0; g < n; g++)
      for (let r = 0; r < n; r++) rows.push(f(r / (n - 1), g / (n - 1), b / (n - 1)).join(" "));
  return rows.join("\n");
};

describe("LUT .cube (#184)", () => {
  it("identitas tidak mengubah piksel, invers membalik, kanal tidak tertukar", () => {
    const px = () => new Uint8ClampedArray([0, 128, 255, 255, 30, 200, 90, 255]);
    const id = px();
    applyLut(id, parseCube(cube(17, (r, g, b) => [r, g, b])));
    expect(Array.from(id)).toEqual(Array.from(px()));
    const inv = px();
    applyLut(inv, parseCube(cube(2, (r, g, b) => [1 - r, 1 - g, 1 - b])));
    expect(Array.from(inv)).toEqual([255, 127, 0, 255, 225, 55, 165, 255]);
    const swap = px();
    applyLut(swap, parseCube(cube(2, (r, g, b) => [b, g, r])));
    expect(Array.from(swap)).toEqual([255, 128, 0, 255, 90, 200, 30, 255]);
  });
  it("file rusak ditolak", () => {
    expect(() => parseCube("LUT_3D_SIZE 2\n0 0 0")).toThrow("tidak lengkap");
    expect(() => parseCube("LUT_1D_SIZE 4")).toThrow("1D");
  });
});
