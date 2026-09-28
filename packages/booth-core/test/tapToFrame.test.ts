import { describe, expect, it } from "vitest";
import { tapToFrame } from "../src/crew/CameraCheck";

describe("tap to focus: layar → frame kamera (#114)", () => {
  const screen = { w: 1920, h: 1080 };
  const frame = { w: 960, h: 640 }; // 3:2, cover → potong atas-bawah
  it("tengah layar = tengah frame; cermin membalik sumbu x", () => {
    expect(tapToFrame({ x: 960, y: 540 }, screen, frame, false)).toEqual({ x: 0.5, y: 0.5 });
    const kiri = tapToFrame({ x: 480, y: 540 }, screen, frame, false);
    expect(kiri.x).toBeCloseTo(0.25);
    expect(tapToFrame({ x: 480, y: 540 }, screen, frame, true).x).toBeCloseTo(0.75);
  });
  it("sumbu y memperhitungkan potongan cover; di luar frame dijepit", () => {
    // skala 2 → tinggi tergambar 1280, 100 px terpotong di atas.
    expect(tapToFrame({ x: 960, y: 0 }, screen, frame, false).y).toBeCloseTo(100 / 1280);
    expect(tapToFrame({ x: -50, y: 2000 }, screen, frame, false)).toEqual({ x: 0, y: 1 });
  });
});
