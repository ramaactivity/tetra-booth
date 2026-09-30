import { createCanvas, loadImage } from "@napi-rs/canvas";
import { filterCss, type LayoutSpec, PHOTO_FILTERS } from "@tetra/shared";
import {
  FIXTURES,
  type ImageLike,
  makeFixtureInputs,
  type RenderContext,
  renderPiece,
} from "@tetra/template-engine";
import { describe, expect, it } from "vitest";
import { MATCH_MAX, matchThumb, thumbDiff } from "../src/rerender";

const ctx: RenderContext = {
  createCanvas: (w, h) => createCanvas(w, h),
  fontFamily: () => "sans-serif",
};
const spec: LayoutSpec = {
  ...FIXTURES["2x6x2"],
  texts: [
    {
      x: 30,
      y: 1700,
      w: 540,
      fontAssetId: "f",
      size: 40,
      color: "#1a1714",
      align: "center",
      value: "{event_name}",
    },
  ],
};
const inputs = makeFixtureInputs(ctx, spec);
const render = (s = spec, filter = "none", name = "Andi & Sari") =>
  renderPiece(s, { ...inputs, photoFilter: filter, vars: { event_name: name } }, ctx);
const thumb = (img: ImageLike) => matchThumb(img, ctx.createCanvas);
/** piece.jpg tersimpan: JPEG 0.95 seperti composeStrip (diuji juga 0.85 supaya ada ruang). */
const jpeg = async (q: number) => {
  const c = createCanvas(600, 1800);
  c.getContext("2d").drawImage(render() as never, 0, 0);
  return loadImage(await c.encode("jpeg", q));
};

describe("pencocokan potongan lama (#140)", () => {
  const stored = thumb(render());

  it("identik → cocok (beda 0)", () => {
    expect(thumbDiff(thumb(render()), stored)).toBe(0);
  });

  it("noise JPEG → tetap cocok", async () => {
    for (const q of [95, 85]) {
      const d = thumbDiff(thumb(await jpeg(q)), stored);
      expect(d).toBeLessThanOrEqual(MATCH_MAX);
    }
  });

  it("filter lain → tidak cocok (semua filter vs Normal)", () => {
    for (const f of PHOTO_FILTERS.filter((x) => x.id !== "normal"))
      expect(thumbDiff(thumb(render(spec, filterCss(f.id))), stored)).toBeGreaterThan(MATCH_MAX);
  });

  it("teks lain / desain lain → tidak cocok", () => {
    expect(thumbDiff(thumb(render(spec, "none", "Budi & Rina")), stored)).toBeGreaterThan(
      MATCH_MAX,
    );
    const moved = {
      ...spec,
      slots: spec.slots.map((s, i) => (i === 3 ? { ...s, y: s.y + 20 } : s)),
    };
    expect(thumbDiff(thumb(render(moved)), stored)).toBeGreaterThan(MATCH_MAX);
    const bg = { ...spec, background: { color: "#f4efe6" } };
    expect(thumbDiff(thumb(render(bg)), stored)).toBeGreaterThan(MATCH_MAX);
  });

  it("ukuran lain → Infinity", () => {
    expect(thumbDiff(thumb(renderPiece(FIXTURES["4R"], inputs, ctx)), stored)).toBe(
      Number.POSITIVE_INFINITY,
    );
  });
});
