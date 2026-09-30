import type { LayoutSpec } from "@tetra/shared";
import { describe, expect, it } from "vitest";
import {
  alignDelta,
  arrange,
  layerStack,
  moveLayer,
  OVERLAY,
  resizeRect,
  rotationAt,
  snapLines,
  snapMove,
} from "./geometry";

const page = { x: 0, y: 0, w: 1200, h: 1800 };
const spec: LayoutSpec = {
  id: "t",
  version: 1,
  paper: "4R",
  canvas: { width: 1200, height: 1800, dpi: 300 },
  slots: [
    { id: "a", x: 0, y: 0, w: 100, h: 100, fit: "cover", z: "below_overlay" },
    { id: "b", x: 0, y: 0, w: 100, h: 100, fit: "cover", z: "above_overlay" },
  ],
  texts: [
    {
      id: "t1",
      x: 0,
      y: 0,
      w: 100,
      fontAssetId: "geist",
      size: 20,
      color: "#000000",
      align: "left",
      value: "x",
    },
  ],
};

describe("snap", () => {
  it("tengah kotak menempel ke tengah halaman dan garisnya tampil", () => {
    const s = snapMove({ x: 548, y: 10, w: 100, h: 50 }, snapLines(page, null, []), 6);
    expect(s.dx).toBe(2);
    expect(s.guides.x).toEqual([600]);
    expect(s.dy).toBe(0);
  });
  it("tepi kiri menempel ke margin aman dan ke tepi objek lain", () => {
    const lines = snapLines(page, 36, [{ x: 300, y: 300, w: 200, h: 200 }]);
    expect(snapMove({ x: 39, y: 900, w: 10, h: 10 }, lines, 6).dx).toBe(-3);
    expect(snapMove({ x: 503, y: 900, w: 10, h: 10 }, lines, 6).dx).toBe(-3);
  });
  it("di luar ambang tidak snap", () => {
    expect(snapMove({ x: 520, y: 900, w: 10, h: 10 }, snapLines(page, null, []), 6).dx).toBe(0);
  });
});

describe("align & resize", () => {
  it("align center / bottom ke halaman", () => {
    expect(alignDelta({ x: 0, y: 0, w: 200, h: 100 }, page, "center")).toEqual({ dx: 500, dy: 0 });
    expect(alignDelta({ x: 0, y: 0, w: 200, h: 100 }, page, "bottom")).toEqual({ dx: 0, dy: 1700 });
  });
  it("resize sudut kanan bawah menjaga rasio, tepi kiri atas diam", () => {
    const r = resizeRect({ x: 10, y: 10, w: 300, h: 200 }, 0, 1, 1, 30, 0, true);
    expect(Object.values(r).map(Math.round)).toEqual([10, 10, 330, 220]);
  });
  it("resize tepi kiri slot berotasi 90° mengikuti sumbu lokal", () => {
    // Rotasi 90°: sumbu x lokal menghadap ke bawah, jadi geser pointer ke atas memperlebar dari kiri.
    const r = resizeRect({ x: 0, y: 0, w: 200, h: 100 }, 90, -1, 0, 0, -50, false);
    expect(Math.round(r.w)).toBe(250);
    expect(Math.round(r.h)).toBe(100);
  });
  it("rotasi snap ke 45°", () => {
    expect(rotationAt(0, 0, 100, -97)).toBe(45);
    expect(rotationAt(0, 0, 0, -100)).toBe(0);
  });
});

describe("layer", () => {
  it("tumpukan default sama dengan engine: bawah, overlay, atas (slot lalu teks)", () => {
    expect(layerStack(spec)).toEqual(["s:a", OVERLAY, "s:b", "t:t1"]);
  });
  it("mundur melewati overlay memindahkan teks ke bawah overlay", () => {
    let l = arrange(spec, ["t:t1"], "backward");
    expect(layerStack(l)).toEqual(["s:a", OVERLAY, "t:t1", "s:b"]);
    l = arrange(l, ["t:t1"], "backward");
    expect(layerStack(l)).toEqual(["s:a", "t:t1", OVERLAY, "s:b"]);
    expect(l.texts[0]?.z).toBe("below_overlay");
  });
  it("paling belakang & drag ke posisi", () => {
    expect(layerStack(arrange(spec, ["s:b"], "back"))).toEqual(["s:b", "s:a", OVERLAY, "t:t1"]);
    expect(layerStack(moveLayer(spec, "s:a", 3))).toEqual([OVERLAY, "s:b", "t:t1", "s:a"]);
  });
});
