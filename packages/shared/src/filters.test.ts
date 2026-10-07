import { describe, expect, it } from "vitest";
import { applyPhotoFilter, filterMatrix } from "./filters";

const px = (rgb: [number, number, number], id: string) => {
  const d = new Uint8ClampedArray([...rgb, 255]);
  applyPhotoFilter(d, id);
  return [...d];
};

describe("applyPhotoFilter", () => {
  it("normal dan id tak dikenal tidak mengubah piksel", () => {
    expect(px([10, 200, 30], "normal")).toEqual([10, 200, 30, 255]);
    expect(px([10, 200, 30], "nope")).toEqual([10, 200, 30, 255]);
  });
  it("hitam putih = grayscale(1) lalu contrast(1.1), sesuai spec CSS", () => {
    // grayscale merah: 0.2126·255 = 54.2; contrast 1.1: 54.2·1.1 − 12.75 = 46.9
    expect(px([255, 0, 0], "bw")).toEqual([47, 47, 47, 255]);
  });
  it("urutan fungsi mengikuti CSS (kiri dulu)", () => {
    // brightness(2) lalu contrast(0): semua jadi abu 0.5 apa pun input
    const m = filterMatrix("brightness(2) contrast(0)");
    expect(m.slice(0, 4)).toEqual([0, 0, 0, 0.5]);
  });
  it("hasil di-clamp 0–255", () => {
    expect(px([250, 250, 250], "faded")[0]).toBeLessThanOrEqual(255);
  });
});
