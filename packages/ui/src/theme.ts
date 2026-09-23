/** Warna aksen per event dengan kontras WCAG AA otomatis. 08-DESIGN §2. */

export const DEFAULT_THEME = {
  bg: "#f6f4f1",
  fg: "#1a1714",
  accent: "#8e2a1e",
} as const;

export const MIN_CONTRAST = 4.5;

type Rgb = [number, number, number];

const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  const n = Number.parseInt(h.length === 3 ? h.replace(/./g, "$&$&") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const rgbToHex = ([r, g, b]: Rgb): string =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;

const luminance = ([r, g, b]: Rgb): number => {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** Rasio kontras WCAG antara dua warna hex (1..21). */
export const contrastRatio = (a: string, b: string): number => {
  const la = luminance(hexToRgb(a));
  const lb = luminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

/** Gelapkan `color` bertahap sampai kontras terhadap `bg` >= min. */
export const ensureContrast = (color: string, bg: string, min = MIN_CONTRAST): string => {
  let rgb = hexToRgb(color);
  for (let i = 0; i < 40 && contrastRatio(rgbToHex(rgb), bg) < min; i++) {
    rgb = rgb.map((c) => c * 0.92) as Rgb;
  }
  return rgbToHex(rgb);
};

export type EventBranding = { color?: string | undefined; bg?: string | undefined };

export type ThemeVars = {
  "--bg": string;
  "--accent": string;
  "--on-accent": string;
};

/** CSS custom properties untuk elemen root layar, dari branding event. */
export const eventThemeVars = (branding: EventBranding = {}): ThemeVars => {
  const bg = branding.bg ?? DEFAULT_THEME.bg;
  const accent = ensureContrast(branding.color ?? DEFAULT_THEME.accent, bg);
  const onAccent =
    contrastRatio("#ffffff", accent) >= contrastRatio(DEFAULT_THEME.fg, accent)
      ? "#ffffff"
      : DEFAULT_THEME.fg;
  return { "--bg": bg, "--accent": accent, "--on-accent": onAccent };
};
