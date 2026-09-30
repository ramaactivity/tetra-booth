import type { LayoutSpec } from "@tetra/shared";
import { describe, expect, it } from "vitest";
import { canonId, fromEditor, toEditor } from "../src/designEdit";

const layout: LayoutSpec = {
  id: "abc-v3",
  version: 3,
  paper: "4R",
  canvas: { width: 1200, height: 1800, dpi: 300 },
  overlay: { assetId: "d1-ov" },
  background: { color: "#fff", assetId: "d1-bg" },
  slots: [{ id: "s1", x: 0, y: 0, w: 100, h: 100, fit: "cover", z: "below_overlay" }],
  texts: [
    {
      x: 0,
      y: 0,
      w: 100,
      fontAssetId: "d1-f1",
      size: 40,
      color: "#000",
      align: "left",
      value: "a",
    },
    {
      x: 0,
      y: 0,
      w: 100,
      fontAssetId: "geist",
      size: 40,
      color: "#000",
      align: "left",
      value: "b",
    },
    {
      x: 0,
      y: 0,
      w: 100,
      fontAssetId: "d1-lib-fraunces-600-normal",
      size: 40,
      color: "#000",
      align: "left",
      value: "c",
    },
  ],
};
const assets = {
  "d1-ov": "d1-ov.png",
  "d1-bg": "d1-bg.jpg",
  "d1-f1": "d1-f1.ttf",
  "d1-lib-fraunces-600-normal": "d1-lib-fraunces-600-normal.woff2",
};

describe("editor desain di booth: id aset bundle ↔ editor (#131)", () => {
  it("awalan desain tambahan / photobox / lokal dilepas", () => {
    expect(canonId("d1-ov")).toBe("ov");
    expect(canonId("p12-f3")).toBe("f3");
    expect(canonId("loc-kx9-ov")).toBe("ov");
    expect(canonId("loc-kx9-d1-lib-fraunces-600-normal")).toBe("lib-fraunces-600-normal");
    expect(canonId("ov")).toBe("ov");
  });
  it("buka: layout memakai id editor, files = nama file bundle", () => {
    const o = toEditor(layout, assets);
    expect(o.layout.overlay?.assetId).toBe("ov");
    expect(o.layout.background?.assetId).toBe("bg");
    expect(o.layout.texts.map((t) => t.fontAssetId)).toEqual([
      "f1",
      "geist",
      "lib-fraunces-600-normal",
    ]);
    expect(o.files).toEqual({
      ov: "d1-ov.png",
      bg: "d1-bg.jpg",
      f1: "d1-f1.ttf",
      "lib-fraunces-600-normal": "d1-lib-fraunces-600-normal.woff2",
    });
  });
  it("simpan: aset lama kembali ke id bundle, file baru jadi loc-<cap>-, id layout tetap", () => {
    const o = toEditor(layout, assets);
    const edited = { ...o.layout, id: "lain" };
    const r = fromEditor(edited, o, layout.id, ["ov"], "k1");
    expect(r.id).toBe("abc-v3");
    expect(r.overlay?.assetId).toBe("loc-k1-ov");
    expect(r.background?.assetId).toBe("d1-bg");
    expect(r.texts.map((t) => t.fontAssetId)).toEqual([
      "d1-f1",
      "geist",
      "d1-lib-fraunces-600-normal",
    ]);
  });
  it("font pustaka yang baru dipilih memakai id lib- polos (disalin booth dari font lokal)", () => {
    const o = toEditor(layout, assets);
    const t = o.layout.texts[0];
    if (!t) throw new Error("teks");
    const edited = { ...o.layout, texts: [{ ...t, fontAssetId: "lib-italianno-400-normal" }] };
    expect(fromEditor(edited, o, layout.id, [], "k").texts[0]?.fontAssetId).toBe(
      "lib-italianno-400-normal",
    );
  });
});
