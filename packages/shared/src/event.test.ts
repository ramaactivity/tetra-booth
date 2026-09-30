import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, EventBundleSchema } from "./event";

const layout = {
  id: "l",
  version: 1,
  paper: "4R",
  canvas: { width: 1200, height: 1800, dpi: 300 },
  slots: [{ id: "a", x: 0, y: 0, w: 100, h: 100, fit: "cover", z: "below_overlay" }],
  overlay: { assetId: "ov" },
  texts: [],
};

describe("EventBundleSchema", () => {
  it("settings kosong → default; aset dirujuk ada", () => {
    const b = EventBundleSchema.parse({
      id: "e1",
      name: "A & B",
      date: "12 Okt",
      layout,
      assets: { ov: "overlay.png" },
    });
    expect(b.settings).toEqual(DEFAULT_SETTINGS);
    expect(b.tagline).toBeUndefined();
  });
  it("tagline opsional, maksimal 40 karakter", () => {
    const base = { id: "e1", name: "x", date: "x", layout, assets: { ov: "overlay.png" } };
    expect(EventBundleSchema.parse({ ...base, tagline: "The Wedding of" }).tagline).toBe(
      "The Wedding of",
    );
    expect(EventBundleSchema.safeParse({ ...base, tagline: "x".repeat(41) }).success).toBe(false);
  });
  it("tolak aset yang dirujuk layout tapi tidak ada", () => {
    expect(EventBundleSchema.safeParse({ id: "e1", name: "x", date: "x", layout }).success).toBe(
      false,
    );
  });
  it("designs (#99): 2–3 desain, aset tiap desain harus ada", () => {
    const base = { id: "e1", name: "x", date: "x", layout, assets: { ov: "overlay.png" } };
    const d = (id: string, assetId = "ov") => ({
      id,
      name: id,
      info: "4R",
      layout: { ...layout, overlay: { assetId } },
    });
    expect(EventBundleSchema.safeParse({ ...base, designs: [d("a"), d("b")] }).success).toBe(true);
    expect(EventBundleSchema.safeParse({ ...base, designs: [d("a")] }).success).toBe(false);
    expect(
      EventBundleSchema.safeParse({
        ...base,
        designs: ["a", "b", "c", "d"].map((i) => d(i)),
      }).success,
    ).toBe(false);
    expect(
      EventBundleSchema.safeParse({ ...base, designs: [d("a"), d("b", "d1-ov")] }).success,
    ).toBe(false);
  });
  it("tolak nama file aset berbahaya", () => {
    for (const f of ["../x.png", "a/b.png", "x.exe", ".png"]) {
      expect(
        EventBundleSchema.safeParse({ id: "e1", name: "x", date: "x", layout, assets: { ov: f } })
          .success,
      ).toBe(false);
    }
  });
  it("tolak id event dengan karakter path", () => {
    expect(
      EventBundleSchema.safeParse({
        id: "../e",
        name: "x",
        date: "x",
        layout,
        assets: { ov: "o.png" },
      }).success,
    ).toBe(false);
  });
});
