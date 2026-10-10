import { describe, expect, it } from "vitest";
import { LayoutSpecSchema, withDefaultQr } from "./layout";
import { LAYOUT_PRESETS } from "./presets";

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

describe("preset layout admin", () => {
  it("semua preset lolos LayoutSpecSchema", () => {
    for (const p of Object.values(LAYOUT_PRESETS))
      expect(LayoutSpecSchema.safeParse({ id: "x", version: 1, ...p.layout }).success).toBe(true);
  });
});

describe("withDefaultQr (#247)", () => {
  const strip = {
    id: "l",
    version: 1,
    paper: "2x6x2" as const,
    canvas: { width: 600, height: 1800, dpi: 300 as const },
    slots: [0, 1, 2].map((i) => ({
      id: `s${i}`,
      x: 30,
      y: 30 + i * 390,
      w: 540,
      h: 360,
      fit: "cover" as const,
      z: "below_overlay" as const,
    })),
    texts: [],
  };
  it("strip PNG tanpa QR dapat QR di kanan-bawah, tidak menutupi slot", () => {
    const qr = withDefaultQr(strip).qr;
    expect(qr).toEqual({ x: 600 - 24 - 132, y: 1800 - 24 - 132, size: 132 });
  });
  it("QR yang sudah ada tidak diubah", () => {
    const l = { ...strip, qr: { x: 1, y: 2, size: 100 } };
    expect(withDefaultQr(l)).toBe(l);
  });
  it("slot menutup seluruh kanvas = tanpa QR", () => {
    const full = { ...strip, slots: [{ ...strip.slots[0], x: 0, y: 0, w: 600, h: 1800 }] };
    expect(withDefaultQr(full as typeof strip).qr).toBeUndefined();
  });
});
