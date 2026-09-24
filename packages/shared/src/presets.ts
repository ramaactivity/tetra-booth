import type { LayoutSpec, LayoutText } from "./layout";

/**
 * Layout preset untuk admin (Fase 3 A4, DECISIONS #66) sampai editor template drag-and-drop tersedia.
 * Overlay PNG & warna latar diatur per event; teks bawah = nama event + tanggal.
 */
export type PresetId = "strip-3" | "strip-4" | "4r-grid" | "4r-single";

const footer = (w: number, y: number): LayoutText[] => [
  {
    x: 30,
    y,
    w: w - 60,
    fontAssetId: "geist",
    size: 52,
    color: "#1a1714",
    align: "center",
    value: "{event_name}",
  },
  {
    x: 30,
    y: y + 80,
    w: w - 60,
    fontAssetId: "geist",
    size: 30,
    color: "#5f5e5a",
    align: "center",
    value: "{date}",
  },
];
const slot = (id: string, x: number, y: number, w: number, h: number) =>
  ({ id, x, y, w, h, fit: "cover", z: "below_overlay" }) as const;

export const LAYOUT_PRESETS: Record<
  PresetId,
  { name: string; info: string; layout: Omit<LayoutSpec, "id" | "version"> }
> = {
  "strip-3": {
    name: "Strip Klasik",
    info: "2x6 · 3 foto",
    layout: {
      paper: "2x6x2",
      canvas: { width: 600, height: 1800, dpi: 300 },
      slots: [0, 1, 2].map((i) => slot(`s${i + 1}`, 30, 30 + i * 390, 540, 360)),
      texts: footer(600, 1330),
    },
  },
  "strip-4": {
    name: "Strip 4 Foto",
    info: "2x6 · 4 foto",
    layout: {
      paper: "2x6x2",
      canvas: { width: 600, height: 1800, dpi: 300 },
      slots: [0, 1, 2, 3].map((i) => slot(`s${i + 1}`, 30, 30 + i * 360, 540, 340)),
      texts: footer(600, 1500),
    },
  },
  "4r-grid": {
    name: "4R Grid",
    info: "4x6 · 4 foto",
    layout: {
      paper: "4R",
      canvas: { width: 1200, height: 1800, dpi: 300 },
      slots: [
        slot("s1", 40, 40, 540, 720),
        slot("s2", 620, 40, 540, 720),
        slot("s3", 40, 800, 540, 720),
        slot("s4", 620, 800, 540, 720),
      ],
      texts: footer(1200, 1590),
    },
  },
  "4r-single": {
    name: "4R Single",
    info: "4x6 · 1 foto",
    layout: {
      paper: "4R",
      canvas: { width: 1200, height: 1800, dpi: 300 },
      slots: [slot("s1", 40, 40, 1120, 1440)],
      texts: footer(1200, 1560),
    },
  },
};
