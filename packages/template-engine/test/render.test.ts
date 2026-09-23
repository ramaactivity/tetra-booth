import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import type { RenderContext } from "../src";
import { FIXTURES, makeFixtureInputs, pixelHash, render } from "../src";

const ctx: RenderContext = {
  createCanvas: (w, h) => createCanvas(w, h),
  fontFamily: () => "sans-serif",
};

describe("template engine", () => {
  it("4R: hash piksel sama dengan snapshot", async () => {
    const out = render(FIXTURES["4R"], makeFixtureInputs(ctx, FIXTURES["4R"]), ctx);
    expect([out.width, out.height]).toEqual([1200, 1800]);
    expect(await pixelHash(out)).toMatchSnapshot();
  });

  it("2x6x2: strip digandakan ke 1200x1800, hash sama dengan snapshot", async () => {
    const spec = FIXTURES["2x6x2"];
    const out = render(spec, makeFixtureInputs(ctx, spec), ctx);
    expect([out.width, out.height]).toEqual([1200, 1800]);
    const g = out.getContext("2d");
    const left = Buffer.from(g?.getImageData(0, 0, 600, 1800).data ?? []);
    const right = Buffer.from(g?.getImageData(600, 0, 600, 1800).data ?? []);
    expect(left.equals(right)).toBe(true);
    expect(await pixelHash(out)).toMatchSnapshot();
  });

  it("teks placeholder diganti dan tergambar", () => {
    const spec = {
      ...FIXTURES["4R"],
      texts: [
        {
          x: 100,
          y: 1500,
          w: 1000,
          fontAssetId: "f",
          size: 80,
          color: "#000000",
          align: "center" as const,
          value: "{event_name}",
        },
      ],
    };
    const inputs = makeFixtureInputs(ctx, spec);
    const withText = render(spec, inputs, ctx);
    const without = render(FIXTURES["4R"], inputs, ctx);
    const a =
      withText.getContext("2d")?.getImageData(100, 1500, 1000, 100).data ?? new Uint8ClampedArray();
    const b =
      without.getContext("2d")?.getImageData(100, 1500, 1000, 100).data ?? new Uint8ClampedArray();
    expect(a).not.toEqual(b);
  });

  it("spec tidak valid ditolak", () => {
    const bad = { ...FIXTURES["4R"], canvas: { width: 10, height: 10, dpi: 300 as const } };
    expect(() => render(bad, makeFixtureInputs(ctx, FIXTURES["4R"]), ctx)).toThrow();
  });
});
