import type { LayoutSpec } from "@tetra/shared";
import type { CanvasLike, RenderContext, RenderInputs } from "./types";

/**
 * Layout contoh untuk test snapshot & pembuktian "render identik di browser dan Electron".
 * Foto dan overlay dibuat prosedural supaya tidak ada file biner di repo.
 */
export const FIXTURES: Record<"4R" | "2x6x2", LayoutSpec> = {
  "4R": {
    id: "fixture-4r",
    version: 1,
    paper: "4R",
    canvas: { width: 1200, height: 1800, dpi: 300 },
    background: { color: "#f6f4f1" },
    slots: [
      { id: "a", x: 100, y: 100, w: 1000, h: 667, fit: "cover", z: "below_overlay" },
      { id: "b", x: 100, y: 850, w: 480, h: 480, fit: "cover", z: "below_overlay", rotation: -4 },
      { id: "c", x: 620, y: 850, w: 480, h: 480, fit: "cover", z: "above_overlay" },
    ],
    overlay: { assetId: "overlay" },
    texts: [],
  },
  "2x6x2": {
    id: "fixture-2x6x2",
    version: 1,
    paper: "2x6x2",
    canvas: { width: 600, height: 1800, dpi: 300 },
    background: { color: "#ffffff" },
    slots: [
      { id: "1", x: 50, y: 60, w: 500, h: 375, fit: "cover", z: "below_overlay" },
      { id: "2", x: 50, y: 470, w: 500, h: 375, fit: "cover", z: "below_overlay" },
      { id: "3", x: 50, y: 880, w: 500, h: 375, fit: "cover", z: "below_overlay" },
      { id: "4", x: 50, y: 1290, w: 500, h: 375, fit: "cover", z: "below_overlay" },
    ],
    overlay: { assetId: "overlay" },
    texts: [],
  },
};

const solid = (ctx: RenderContext, w: number, h: number, color: string): CanvasLike => {
  const c = ctx.createCanvas(w, h);
  const g = c.getContext("2d");
  if (!g) throw new Error("no 2d");
  g.fillStyle = color;
  g.fillRect(0, 0, w, h);
  g.fillStyle = "#ffffff";
  g.fillRect(w * 0.1, h * 0.1, w * 0.3, h * 0.3);
  return c;
};

const frame = (ctx: RenderContext, w: number, h: number): CanvasLike => {
  const c = ctx.createCanvas(w, h);
  const g = c.getContext("2d");
  if (!g) throw new Error("no 2d");
  g.fillStyle = "#8e2a1e";
  g.fillRect(0, 0, w, 24);
  g.fillRect(0, h - 24, w, 24);
  g.fillRect(0, 0, 24, h);
  g.fillRect(w - 24, 0, 24, h);
  return c;
};

/** Foto berwarna 3:2 dan overlay bingkai untuk fixture. */
export const makeFixtureInputs = (ctx: RenderContext, spec: LayoutSpec): RenderInputs => ({
  photos: ["#2a4d69", "#c98a2b", "#3b7a57", "#7a3b6e"].map((col) => solid(ctx, 900, 600, col)),
  assets: { overlay: frame(ctx, spec.canvas.width, spec.canvas.height) },
  vars: { event_name: "Andi & Sari", date: "12 Oktober 2026" },
});
