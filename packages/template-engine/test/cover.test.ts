import type { LayoutSpec } from "@tetra/shared";
import { describe, expect, it } from "vitest";
import type { CanvasLike, Ctx2D, RenderContext } from "../src";
import { render } from "../src";

/** Ctx palsu yang mencatat panggilan, untuk menguji matematika cover & urutan gambar tanpa rasterizer. */
const recorder = () => {
  const calls: string[] = [];
  const ctx: Ctx2D = {
    fillStyle: "",
    font: "",
    textAlign: "left",
    textBaseline: "top",
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: (x, y) => calls.push(`translate ${x} ${y}`),
    rotate: (r) => calls.push(`rotate ${r.toFixed(4)}`),
    beginPath: () => {},
    rect: (x, y, w, h) => calls.push(`clip ${x} ${y} ${w} ${h}`),
    clip: () => {},
    fillRect: (x, y, w, h) => calls.push(`fillRect ${x} ${y} ${w} ${h}`),
    fillText: (t, x, y) => calls.push(`text "${t}" ${x} ${y}`),
    drawImage: (img: { width: number }, dx, dy, dw, dh) =>
      calls.push(`draw ${img.width}w ${[dx, dy, dw, dh].map((n) => n.toFixed(2)).join(" ")}`),
    getImageData: () => ({ data: new Uint8ClampedArray() }),
  };
  const canvas = (w: number, h: number): CanvasLike => ({
    width: w,
    height: h,
    getContext: () => ctx,
  });
  const rc: RenderContext = { createCanvas: canvas, fontFamily: () => "F" };
  return { calls, rc };
};

const spec: LayoutSpec = {
  id: "t",
  version: 1,
  paper: "4R",
  canvas: { width: 1200, height: 1800, dpi: 300 },
  background: { color: "#ffffff" },
  slots: [
    { id: "wide", x: 100, y: 100, w: 1000, h: 500, fit: "cover", z: "below_overlay" },
    { id: "rot", x: 0, y: 0, w: 200, h: 200, fit: "cover", z: "above_overlay", rotation: 90 },
  ],
  overlay: { assetId: "ov" },
  texts: [
    {
      x: 0,
      y: 1700,
      w: 1200,
      fontAssetId: "f",
      size: 40,
      color: "#000000",
      align: "center",
      value: "{event_name}",
    },
  ],
};

describe("cover & urutan gambar", () => {
  it("foto 3:2 di slot 2:1 di-scale ke lebar lalu di-crop tengah; rotasi & urutan sesuai TSD §6", () => {
    const { calls, rc } = recorder();
    render(
      spec,
      {
        photos: [
          { width: 900, height: 600 },
          { width: 100, height: 400 },
        ],
        assets: { ov: { width: 1200, height: 1800 } },
        vars: { event_name: "X" },
      },
      rc,
    );
    // scale = max(1000/900, 500/600) = 1.111 → 1000×666.67, digambar terpusat di slot
    expect(calls).toContain("translate 600 350");
    expect(calls).toContain("clip -500 -250 1000 500");
    expect(calls.find((c) => c.startsWith("draw 900w"))).toBe(
      "draw 900w -500.00 -333.33 1000.00 666.67",
    );
    // slot kedua: rotasi 90°, foto 1:4 di slot 1:1 → scale 2 → 200×800
    expect(calls).toContain(`rotate ${(Math.PI / 2).toFixed(4)}`);
    expect(calls.find((c) => c.startsWith("draw 100w"))).toBe(
      "draw 100w -100.00 -400.00 200.00 800.00",
    );
    // urutan: background → slot bawah → overlay → slot atas → teks
    const idx = (p: string) => calls.findIndex((c) => c.startsWith(p));
    expect(idx("fillRect 0 0 1200 1800")).toBeLessThan(idx("draw 900w"));
    expect(idx("draw 900w")).toBeLessThan(idx("draw 1200w"));
    expect(idx("draw 1200w")).toBeLessThan(idx("draw 100w"));
    expect(idx("draw 100w")).toBeLessThan(idx('text "X" 600 1700'));
  });

  it("urutan layer editor: teks di bawah overlay & `order` mendahului urutan array", () => {
    const { calls, rc } = recorder();
    const ordered: LayoutSpec = {
      ...spec,
      slots: spec.slots.map((s, i) =>
        i === 0 ? { ...s, order: 2 } : { ...s, z: "below_overlay" as const, order: 1 },
      ),
      texts: spec.texts.map((t) => ({ ...t, z: "below_overlay" as const, order: 0 })),
    };
    render(
      ordered,
      {
        photos: [
          { width: 900, height: 600 },
          { width: 100, height: 400 },
        ],
        assets: { ov: { width: 1200, height: 1800 } },
        vars: { event_name: "X" },
      },
      rc,
    );
    const idx = (p: string) => calls.findIndex((c) => c.startsWith(p));
    expect(idx('text "X"')).toBeLessThan(idx("draw 100w"));
    expect(idx("draw 100w")).toBeLessThan(idx("draw 900w"));
    expect(idx("draw 900w")).toBeLessThan(idx("draw 1200w"));
  });
});
