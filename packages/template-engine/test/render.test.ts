import { createCanvas } from "@napi-rs/canvas";
import { LAYOUT_PRESETS } from "@tetra/shared";
import { describe, expect, it } from "vitest";
import type { RenderContext } from "../src";
import { FIXTURES, makeFixtureInputs, pixelHash, render, renderPiece } from "../src";

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

  it("filter foto (#116): hanya foto di slot yang kena; hash tanpa filter tidak berubah", async () => {
    const spec = FIXTURES["4R"];
    const inputs = makeFixtureInputs(ctx, spec);
    const plain = render(spec, inputs, ctx);
    const bw = render(spec, { ...inputs, photoFilter: "grayscale(1)" }, ctx);
    const s0 = spec.slots[0];
    if (!s0) throw new Error("tanpa slot");
    const at = (c: typeof plain, x: number, y: number) => [
      ...(c.getContext("2d")?.getImageData(x, y, 1, 1).data ?? []),
    ];
    const [r, g, b] = at(bw, Math.round(s0.x + s0.w / 2), Math.round(s0.y + s0.h / 2));
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(at(plain, Math.round(s0.x + s0.w / 2), Math.round(s0.y + s0.h / 2))).not.toEqual(
      at(bw, Math.round(s0.x + s0.w / 2), Math.round(s0.y + s0.h / 2)),
    );
    // "none" = sama persis dengan tanpa filter.
    expect(await pixelHash(render(spec, { ...inputs, photoFilter: "none" }, ctx))).toBe(
      await pixelHash(plain),
    );
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

  it("semua preset (portrait & landscape) jadi lembar 1200x1800; landscape diputar searah jarum jam", () => {
    for (const [id, p] of Object.entries(LAYOUT_PRESETS)) {
      const spec = { id, version: 1, ...p.layout, background: { color: "#ffffff" } };
      const inputs = makeFixtureInputs(ctx, spec);
      const sheet = render(spec, inputs, ctx);
      expect([id, sheet.width, sheet.height]).toEqual([id, 1200, 1800]);
      const g = sheet.getContext("2d");
      const px = (x: number, y: number) => [...(g?.getImageData(x, y, 1, 1).data ?? [])].join();
      const piece = renderPiece(spec, inputs, ctx).getContext("2d");
      const s0 = spec.slots[0];
      if (!s0 || !piece) throw new Error("preset tanpa slot");
      // Titik di dalam slot pertama potongan pertama, lalu posisinya di lembar.
      const [x, y] = [s0.x + 5, s0.y + 5];
      const want = [...piece.getImageData(x, y, 1, 1).data].join();
      const { width: w, height: h } = spec.canvas;
      // Lembar melebar sebelum diputar: 4R & 2R landscape, polaroid portrait (dua berdampingan).
      const rotated = spec.paper === "3x4x2" ? w < h : w > h;
      expect([id, rotated ? px(1199 - y, x) : px(x, y)]).toEqual([id, want]);
    }
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
