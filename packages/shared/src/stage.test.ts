import { describe, expect, it } from "vitest";
import { DEFAULT_STAGE_PRESET, StagePresetSchema, stagePresetCss } from "./stage";

describe("preset warna Photo Stage (#178)", () => {
  it("bawaan = tanpa filter", () => {
    expect(stagePresetCss(DEFAULT_STAGE_PRESET)).toBe("none");
  });
  it("filter dulu, lalu penyesuaian", () => {
    expect(
      stagePresetCss({ filter: "warm", brightness: 10, contrast: -20, saturation: 15, warmth: 30 }),
    ).toBe(
      "sepia(0.25) saturate(1.2) brightness(1.03) brightness(1.1) contrast(0.8) saturate(1.15) sepia(0.3) saturate(1.15)",
    );
  });
  it("nilai di luar batas ditolak", () => {
    expect(StagePresetSchema.safeParse({ brightness: 80 }).success).toBe(false);
    expect(StagePresetSchema.safeParse({ warmth: -60 }).success).toBe(false);
    expect(stagePresetCss({ ...StagePresetSchema.parse({}), warmth: -20 })).toBe(
      "hue-rotate(5deg) saturate(0.95)",
    );
  });
});
