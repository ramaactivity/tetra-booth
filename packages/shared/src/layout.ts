import { z } from "zod";
import { canvasFits, LayoutPaperSchema } from "./paper";

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
  /** Urutan gambar di dalam kelompok z (kecil = belakang). Kosong = urutan array, slot sebelum teks. */
  order: z.number().optional(),
});

export const TextSchema = z.object({
  /** Identitas stabil untuk editor (tidak dipakai render). */
  id: z.string().optional(),
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  fontAssetId: z.string().min(1),
  size: z.number().positive(),
  color: hexColor,
  align: z.enum(["left", "center", "right"]),
  /** Boleh berisi placeholder {event_name}, {date}, {custom}. */
  value: z.string(),
  /** Kosong = di atas overlay (perilaku lama). */
  z: z.enum(["below_overlay", "above_overlay"]).optional(),
  order: z.number().optional(),
});

/**
 * QR link halaman tamu (unduh softfile) di desain, selalu paling atas. Diisi booth dengan URL sesi saat compose;
 * editor & pratinjau memakai URL contoh. `size` = sisi persegi termasuk tepi putih.
 */
export const QrSchema = z.object({
  x: z.number(),
  y: z.number(),
  size: z.number().positive(),
  color: hexColor.optional(),
  /** Latar kotak QR; kosong = putih (QR butuh kontras untuk dipindai). */
  background: hexColor.optional(),
});

export const LayoutSpecSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    paper: LayoutPaperSchema,
    canvas: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      dpi: z.literal(300),
    }),
    background: z
      .object({ color: hexColor.optional(), assetId: z.string().min(1).optional() })
      .optional(),
    slots: z.array(SlotSchema).min(1),
    /** Posisi/ukuran kosong = ditarik penuh ke kanvas (perilaku lama). */
    overlay: z
      .object({
        assetId: z.string().min(1),
        x: z.number().optional(),
        y: z.number().optional(),
        w: z.number().positive().optional(),
        h: z.number().positive().optional(),
      })
      .optional(),
    texts: z.array(TextSchema),
    qr: QrSchema.optional(),
  })
  .refine((s) => canvasFits(s.paper, s.canvas), {
    message: "ukuran canvas tidak sesuai preset kertas",
    path: ["canvas"],
  });

export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;
export type LayoutSlot = z.infer<typeof SlotSchema>;
export type LayoutText = z.infer<typeof TextSchema>;
export type LayoutQr = z.infer<typeof QrSchema>;

/** Tata letak tersimpan (tabel `layout_presets`): posisi slot foto saja, untuk satu kanvas (format + orientasi). */
export const SavedPreset = z.object({
  id: z.string(),
  name: z.string(),
  paper: LayoutPaperSchema,
  width: z.number().int(),
  height: z.number().int(),
  slots: z.array(SlotSchema).min(1).max(40),
});
export type SavedPreset = z.infer<typeof SavedPreset>;

/** assetId tetap: overlay, gambar latar, font f1..f4. Nama file di bundle = `${assetId}.${ext}`. */
export const FONT_IDS = ["f1", "f2", "f3", "f4"] as const;
export const ASSET_IDS = ["ov", "bg", ...FONT_IDS] as const;
export type AssetId = (typeof ASSET_IDS)[number];

/**
 * Margin aman cetak: 3 mm (36 px @300 dpi) dari tiap tepi kanvas. Kalibrasi DNP (DECISIONS #47/#59): gambar
 * dicetak *cover* dengan pembesaran ±3%, jadi ±1,8 mm tiap tepi bisa terpotong; 3 mm memberi cadangan pisau.
 * Untuk 2x6 berlaku per strip (garis potong di tengah lembar).
 */
export const SAFE_MARGIN_PX = 36;
