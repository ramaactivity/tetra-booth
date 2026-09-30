import type { EventBundle, LayoutSpec } from "@tetra/shared";
import { describe, expect, it } from "vitest";
import {
  applyDesignOverride,
  EMPTY_DESIGN,
  parseDesignOverride,
  resetDesign,
  saveDesign,
} from "./design-override";

const layout = (id: string, extra: Partial<LayoutSpec> = {}): LayoutSpec => ({
  id,
  version: 1,
  paper: "4R",
  canvas: { width: 1200, height: 1800, dpi: 300 },
  slots: [{ id: "s1", x: 0, y: 0, w: 100, h: 100, fit: "cover", z: "below_overlay" }],
  texts: [],
  ...extra,
});
const bundle = {
  id: "e1",
  layout: layout("a"),
  designs: [
    { id: "a", name: "A", info: "4R", layout: layout("a") },
    { id: "b", name: "B", info: "4R", layout: layout("b", { overlay: { assetId: "d1-ov" } }) },
  ],
  assets: { "d1-ov": "d1-ov.png" },
} as unknown as EventBundle;

describe("desain diedit di booth (#128/#131)", () => {
  it("layout dengan id sama diganti di layout utama & desain; aset lokal ikut terdaftar", () => {
    const edited = layout("a", { overlay: { assetId: "loc-x-ov" } });
    const { next } = saveDesign(EMPTY_DESIGN, edited, { "loc-x-ov": "loc-x-ov.png" }, "t");
    const r = applyDesignOverride(bundle, next);
    expect(r.layout).toBe(edited);
    expect(r.designs?.[0]?.layout).toBe(edited);
    expect(r.designs?.[1]?.layout.id).toBe("b");
    expect(r.assets).toEqual({ "d1-ov": "d1-ov.png", "loc-x-ov": "loc-x-ov.png" });
  });
  it("tanpa override = bundle apa adanya", () => {
    expect(applyDesignOverride(bundle, EMPTY_DESIGN)).toBe(bundle);
  });
  it("aset lokal yang tidak dirujuk lagi dibuang (file dihapus host)", () => {
    const one = saveDesign(
      EMPTY_DESIGN,
      layout("a", { overlay: { assetId: "loc-1-ov" } }),
      { "loc-1-ov": "loc-1-ov.png" },
      "t1",
    ).next;
    const two = saveDesign(
      one,
      layout("a", { overlay: { assetId: "loc-2-ov" } }),
      { "loc-2-ov": "loc-2-ov.png" },
      "t2",
    );
    expect(two.unused).toEqual(["loc-1-ov.png"]);
    expect(two.next.assets).toEqual({ "loc-2-ov": "loc-2-ov.png" });
  });
  it("kembalikan ke cloud: satu layout atau semua", () => {
    const a = saveDesign(EMPTY_DESIGN, layout("a"), {}, "t").next;
    const ab = saveDesign(
      a,
      layout("b", { overlay: { assetId: "loc-b" } }),
      { "loc-b": "b.png" },
      "t",
    ).next;
    const r = resetDesign(ab, "b");
    expect(Object.keys(r.next.layouts)).toEqual(["a"]);
    expect(r.unused).toEqual(["b.png"]);
    expect(resetDesign(ab, null)).toEqual({ next: EMPTY_DESIGN, unused: ["b.png"] });
  });
  it("isi kv rusak diabaikan", () => {
    expect(parseDesignOverride(null)).toEqual(EMPTY_DESIGN);
    expect(parseDesignOverride("{rusak")).toEqual(EMPTY_DESIGN);
    expect(parseDesignOverride('{"layouts":{"a":{"id":"a"}}}')).toEqual(EMPTY_DESIGN);
  });
});
