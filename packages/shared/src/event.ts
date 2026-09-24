import { z } from "zod";
import { LayoutSpecSchema } from "./layout";

/** Pengaturan pengalaman per event (FSD §5.4 "Pengalaman"). Field kosong = default. */
export const EventSettingsSchema = z.object({
  countdownSec: z.number().int().min(1).max(10).default(3),
  shotDelaySec: z.number().min(0).max(10).default(2),
  retakeMax: z.number().int().min(0).max(5).default(1),
  maxPrints: z.number().int().min(1).max(10).default(2),
  reviewTimeoutSec: z.number().int().min(5).max(120).default(20),
  qrScreenSec: z.number().int().min(10).max(300).default(45),
});
export type EventSettings = z.infer<typeof EventSettingsSchema>;
export const DEFAULT_SETTINGS: EventSettings = EventSettingsSchema.parse({});

/** Nama file aset di folder bundle: tanpa path, tanpa `..`. */
const AssetFile = z
  .string()
  .regex(/^[\w][\w.-]*\.(png|jpg|jpeg|ttf|otf|woff2)$/i, "nama file aset tidak valid");

/**
 * Bundle event lokal: `events/{id}/bundle/config.json` + file aset di folder yang sama (TSD §3, §4.1).
 * Fase 1: disalin manual; Fase 2: diunduh dari cloud dengan format yang sama.
 * `assets`: assetId → nama file (overlay, background, font) yang dirujuk `layout`.
 */
export const EventBundleSchema = z
  .object({
    id: z.string().regex(/^[\w-]{1,64}$/),
    name: z.string().min(1).max(120),
    date: z.string().min(1).max(60),
    layout: LayoutSpecSchema,
    settings: EventSettingsSchema.default(DEFAULT_SETTINGS),
    assets: z.record(z.string().min(1).max(64), AssetFile).default({}),
  })
  .superRefine((b, ctx) => {
    const refs = [
      b.layout.overlay?.assetId,
      b.layout.background?.assetId,
      ...b.layout.texts.map((t) => t.fontAssetId),
    ];
    for (const id of refs) {
      if (id && !(id in b.assets) && id !== "geist") {
        ctx.addIssue({
          code: "custom",
          path: ["assets"],
          message: `aset "${id}" dirujuk layout tapi tidak ada`,
        });
      }
    }
  });
export type EventBundle = z.infer<typeof EventBundleSchema>;
