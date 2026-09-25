import type { LayoutSpec, LayoutText } from "./layout";
import type { LayoutPaper } from "./paper";

/**
 * Tata letak awal untuk template (DECISIONS #66/#78): 4R, 2R (strip 2x6), dan polaroid (3x4),
 * masing-masing portrait & landscape. Teks = nama event + tanggal.
 */
type Rect = [x: number, y: number, w: number, h: number];
type Preset = {
  name: string;
  info: string;
  /** Kelompok di dropdown, mis. "4R portrait". */
  group: string;
  layout: Omit<LayoutSpec, "id" | "version">;
};

const text = (x: number, y: number, w: number): LayoutText[] => [
  {
    x,
    y,
    w,
    fontAssetId: "geist",
    size: 52,
    color: "#1a1714",
    align: "center",
    value: "{event_name}",
  },
  {
    x,
    y: y + 80,
    w,
    fontAssetId: "geist",
    size: 30,
    color: "#5f5e5a",
    align: "center",
    value: "{date}",
  },
];

/** Bagi area jadi `cols`×`rows` slot dengan jarak `gap`. */
const grid = ([x, y, w, h]: Rect, cols: number, rows: number, gap = 30): Rect[] => {
  const cw = (w - gap * (cols - 1)) / cols;
  const rh = (h - gap * (rows - 1)) / rows;
  return Array.from({ length: cols * rows }, (_, i) => [
    Math.round(x + (i % cols) * (cw + gap)),
    Math.round(y + Math.floor(i / cols) * (rh + gap)),
    Math.round(cw),
    Math.round(rh),
  ]);
};

const SIZE: Record<LayoutPaper, { size: string; label: string; w: number; h: number }> = {
  "4R": { size: "4x6", label: "4R", w: 1200, h: 1800 },
  "2x6x2": { size: "2x6", label: "2R", w: 600, h: 1800 },
  "3x4x2": { size: "3x4", label: "Polaroid", w: 900, h: 1200 },
};

const make = (
  paper: LayoutPaper,
  landscape: boolean,
  name: string,
  slots: Rect[],
  texts: LayoutText[],
): Preset => {
  const s = SIZE[paper];
  const [width, height] = landscape ? [s.h, s.w] : [s.w, s.h];
  return {
    name,
    info: `${landscape ? s.size.split("x").reverse().join("x") : s.size} · ${slots.length} foto`,
    group: `${s.label} ${landscape ? "landscape" : "portrait"}`,
    layout: {
      paper,
      canvas: { width, height, dpi: 300 },
      slots: slots.map(([x, y, w, h], i) => ({
        id: `s${i + 1}`,
        x,
        y,
        w,
        h,
        fit: "cover",
        z: "below_overlay",
      })),
      texts,
    },
  };
};

export const LAYOUT_PRESETS = {
  // 4R portrait 1200×1800
  "4r-single": make("4R", false, "4R Single", [[40, 40, 1120, 1440]], text(30, 1560, 1140)),
  "4r-2": make("4R", false, "4R Duo", grid([40, 40, 1120, 1480], 1, 2), text(30, 1580, 1140)),
  "4r-3": make(
    "4R",
    false,
    "4R Trio",
    [[40, 40, 1120, 740], ...grid([40, 810, 1120, 710], 2, 1)],
    text(30, 1580, 1140),
  ),
  "4r-grid": make(
    "4R",
    false,
    "4R Grid",
    grid([40, 40, 1120, 1480], 2, 2, 40),
    text(30, 1590, 1140),
  ),
  // 4R landscape 1800×1200
  "4rl-single": make("4R", true, "4R Single", [[180, 40, 1440, 960]], text(30, 1040, 1740)),
  "4rl-2": make("4R", true, "4R Duo", grid([40, 40, 1720, 960], 2, 1), text(30, 1040, 1740)),
  "4rl-3": make(
    "4R",
    true,
    "4R Trio",
    [[40, 40, 1060, 960], ...grid([1130, 40, 630, 960], 1, 2)],
    text(30, 1040, 1740),
  ),
  "4rl-grid": make("4R", true, "4R Grid", grid([40, 40, 1720, 960], 2, 2), text(30, 1040, 1740)),
  // 2R portrait (strip 2×6) 600×1800
  "strip-2": make(
    "2x6x2",
    false,
    "Strip 2 Foto",
    grid([40, 40, 520, 1460], 1, 2),
    text(30, 1560, 540),
  ),
  "strip-3": make(
    "2x6x2",
    false,
    "Strip Klasik",
    [0, 1, 2].map((i): Rect => [30, 30 + i * 390, 540, 360]),
    text(30, 1330, 540),
  ),
  "strip-4": make(
    "2x6x2",
    false,
    "Strip 4 Foto",
    [0, 1, 2, 3].map((i): Rect => [30, 30 + i * 360, 540, 340]),
    text(30, 1500, 540),
  ),
  // 2R landscape (tiket 6×2) 1800×600: foto di kiri, teks di kanan
  "ticket-2": make(
    "2x6x2",
    true,
    "Tiket 2 Foto",
    grid([40, 40, 1200, 520], 2, 1),
    text(1270, 220, 490),
  ),
  "ticket-3": make(
    "2x6x2",
    true,
    "Tiket 3 Foto",
    grid([40, 40, 1200, 520], 3, 1),
    text(1270, 220, 490),
  ),
  "ticket-4": make(
    "2x6x2",
    true,
    "Tiket 4 Foto",
    grid([40, 40, 1300, 520], 4, 1),
    text(1370, 220, 390),
  ),
  // Polaroid portrait 900×1200: bingkai bawah tebal
  "polaroid-1": make("3x4x2", false, "Polaroid", [[50, 50, 800, 800]], text(40, 930, 820)),
  "polaroid-2": make(
    "3x4x2",
    false,
    "Polaroid Duo",
    grid([50, 50, 800, 960], 1, 2),
    text(40, 1040, 820),
  ),
  // Polaroid landscape 1200×900
  "polaroidl-1": make("3x4x2", true, "Polaroid", [[50, 50, 1100, 620]], text(40, 720, 1120)),
  "polaroidl-2": make(
    "3x4x2",
    true,
    "Polaroid Duo",
    grid([50, 50, 1100, 620], 2, 1),
    text(40, 720, 1120),
  ),
} satisfies Record<string, Preset>;

export type PresetId = keyof typeof LAYOUT_PRESETS;

/** Preset yang bisa dipilih langsung di Pengaturan event & dijual di photobox; format lain lewat menu Template. */
export const EVENT_PRESETS = [
  "strip-3",
  "strip-4",
  "4r-grid",
  "4r-single",
] as const satisfies PresetId[];

/** Label format, mis. "Polaroid 3x4" atau "2R 6x2 landscape". */
export const paperLabel = (paper: LayoutPaper, canvas?: { width: number; height: number }) => {
  const s = SIZE[paper];
  const land = !!canvas && canvas.width > canvas.height;
  return `${s.label} ${land ? s.size.split("x").reverse().join("x") : s.size}${land ? " landscape" : ""}`;
};
