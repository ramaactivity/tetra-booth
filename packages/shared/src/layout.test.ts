import { describe, expect, it } from "vitest";
import { LayoutSpecSchema } from "./layout";

const base = {
  id: "l1",
  version: 1,
  paper: "4R",
  canvas: { width: 1200, height: 1800, dpi: 300 },
  slots: [{ id: "s1", x: 0, y: 0, w: 600, h: 400, fit: "cover", z: "below_overlay" }],
  texts: [],
};

describe("LayoutSpecSchema", () => {
  it("menerima spec 4R valid", () => {
    expect(LayoutSpecSchema.safeParse(base).success).toBe(true);
  });
  it("menerima spec 2x6x2 (600x1800)", () => {
    const s = { ...base, paper: "2x6x2", canvas: { width: 600, height: 1800, dpi: 300 } };
    expect(LayoutSpecSchema.safeParse(s).success).toBe(true);
  });
  it("menolak canvas yang tidak cocok dengan preset", () => {
    const s = { ...base, paper: "2x6x2" };
    expect(LayoutSpecSchema.safeParse(s).success).toBe(false);
  });
  it("menolak tanpa slot dan warna bukan hex", () => {
    expect(LayoutSpecSchema.safeParse({ ...base, slots: [] }).success).toBe(false);
    expect(LayoutSpecSchema.safeParse({ ...base, background: { color: "red" } }).success).toBe(
      false,
    );
  });
});
