import { LayoutSpecSchema } from "@tetra/shared";
import { z } from "zod";

/**
 * Template buatan admin (editor E4, DECISIONS #74). `layout_versions.spec` = layout + file aset (R2) per assetId.
 * Versi tidak pernah diubah; simpan = versi baru. Event mengunci versi saat pengaturannya disimpan.
 */
export const StoredLayout = z.object({
  layout: LayoutSpecSchema,
  files: z.record(z.string(), z.object({ file: z.string(), sha256: z.string(), key: z.string() })),
});
export type StoredLayout = z.infer<typeof StoredLayout>;

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
