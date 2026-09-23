import { z } from "zod";

export const PaperSchema = z.enum(["4R", "2x6x2"]);
export type Paper = z.infer<typeof PaperSchema>;

export const PRINT_DPI = 300;

/** Kanvas cetak fisik selalu 4×6 inci @300dpi. */
export const PRINT_CANVAS = { width: 1200, height: 1800 } as const;

/** Ukuran kanvas render per preset (2x6x2 = satu strip, digandakan saat cetak). TSD §6. */
export const PAPER_CANVAS: Record<Paper, { width: number; height: number }> = {
  "4R": { width: 1200, height: 1800 },
  "2x6x2": { width: 600, height: 1800 },
};
