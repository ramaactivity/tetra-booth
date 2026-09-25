import { z } from "zod";

/** Mode kertas yang dikenal printer / Camera Service: 4R utuh atau 4R dengan potong 2 inci (#52). */
export const PaperSchema = z.enum(["4R", "2x6x2"]);
export type Paper = z.infer<typeof PaperSchema>;

/**
 * Format layout (DECISIONS #78). Semua dicetak di satu lembar 4R:
 * `4R` = satu potong 4×6; `2x6x2` = 2R, dua strip 2×6 (dipotong mesin);
 * `3x4x2` = polaroid, dua potong 3×4 di kertas berperforasi (disobek crew, dicetak sebagai 4R).
 * Tiap format boleh portrait atau landscape (kanvas ditukar).
 */
export const LayoutPaperSchema = z.enum(["4R", "2x6x2", "3x4x2"]);
export type LayoutPaper = z.infer<typeof LayoutPaperSchema>;

export const PRINT_DPI = 300;

/** Kanvas cetak fisik selalu 4×6 inci @300dpi. */
export const PRINT_CANVAS = { width: 1200, height: 1800 } as const;

/** Ukuran kanvas satu potong, orientasi portrait (landscape = ditukar). TSD §6. */
export const PAPER_CANVAS: Record<LayoutPaper, { width: number; height: number }> = {
  "4R": { width: 1200, height: 1800 },
  "2x6x2": { width: 600, height: 1800 },
  "3x4x2": { width: 900, height: 1200 },
};

/** Kanvas sah untuk format: portrait atau landscape. */
export const canvasFits = (paper: LayoutPaper, c: { width: number; height: number }) => {
  const p = PAPER_CANVAS[paper];
  return (
    (c.width === p.width && c.height === p.height) || (c.width === p.height && c.height === p.width)
  );
};

/** Mode printer untuk format: hanya 2R yang dipotong mesin. */
export const printPaper = (paper: LayoutPaper): Paper => (paper === "2x6x2" ? "2x6x2" : "4R");
