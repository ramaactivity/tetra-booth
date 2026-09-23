import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  DEFAULT_THEME,
  ensureContrast,
  eventThemeVars,
  MIN_CONTRAST,
} from "./theme";

describe("theme", () => {
  it("kontras hitam-putih = 21", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });
  it("aksen default sudah AA terhadap bg default", () => {
    expect(contrastRatio(DEFAULT_THEME.accent, DEFAULT_THEME.bg)).toBeGreaterThanOrEqual(
      MIN_CONTRAST,
    );
    expect(ensureContrast(DEFAULT_THEME.accent, DEFAULT_THEME.bg)).toBe(DEFAULT_THEME.accent);
  });
  it("aksen terang (kuning) digelapkan sampai AA", () => {
    const fixed = ensureContrast("#ffd700", DEFAULT_THEME.bg);
    expect(fixed).not.toBe("#ffd700");
    expect(contrastRatio(fixed, DEFAULT_THEME.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
  it("eventThemeVars memilih teks di atas aksen dengan kontras terbaik", () => {
    const dark = eventThemeVars({ color: "#1d3557" });
    expect(dark["--on-accent"]).toBe("#ffffff");
    const light = eventThemeVars({ color: "#c9d6df", bg: "#111111" });
    expect(light["--on-accent"]).toBe(DEFAULT_THEME.fg);
  });
});
