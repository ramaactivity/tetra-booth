import { z } from "zod";
import { PAPER_CANVAS, PaperSchema } from "./paper";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "warna harus #RRGGBB");

export const SlotSchema = z.object({
  id: z.string().min(1),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: z.number().optional(),
  fit: z.literal("cover"),
  z: z.enum(["below_overlay", "above_overlay"]),
});

export const TextSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  fontAssetId: z.string().min(1),
  size: z.number().positive(),
  color: hexColor,
  align: z.enum(["left", "center", "right"]),
  /** Boleh berisi placeholder {event_name}, {date}, {custom}. */
  value: z.string(),
});

export const LayoutSpecSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    paper: PaperSchema,
    canvas: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      dpi: z.literal(300),
    }),
    background: z
      .object({ color: hexColor.optional(), assetId: z.string().min(1).optional() })
      .optional(),
    slots: z.array(SlotSchema).min(1),
    overlay: z.object({ assetId: z.string().min(1) }).optional(),
    texts: z.array(TextSchema),
  })
  .refine(
    (s) =>
      s.canvas.width === PAPER_CANVAS[s.paper].width &&
      s.canvas.height === PAPER_CANVAS[s.paper].height,
    { message: "ukuran canvas tidak sesuai preset kertas", path: ["canvas"] },
  );

export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;
export type LayoutSlot = z.infer<typeof SlotSchema>;
export type LayoutText = z.infer<typeof TextSchema>;
