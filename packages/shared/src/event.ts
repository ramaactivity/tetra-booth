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
  /** Photobox: timer sesi mulai setelah bayar (FSD §1.5). */
  sessionSec: z.number().int().min(60).max(900).default(180),
});
export type EventSettings = z.infer<typeof EventSettingsSchema>;
export const DEFAULT_SETTINGS: EventSettings = EventSettingsSchema.parse({});

/** Nama file aset di folder bundle: tanpa path, tanpa `..`. */
const AssetFile = z
  .string()
  .regex(/^[\w][\w.-]*\.(png|jpg|jpeg|ttf|otf|woff2)$/i, "nama file aset tidak valid");

/** Satu desain yang bisa dipilih tamu di mode event (DECISIONS #99). `id` = id layout-nya. */
export const EventDesignSchema = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  name: z.string().min(1).max(40),
  info: z.string().max(40),
  layout: LayoutSpecSchema,
});
export type EventDesign = z.infer<typeof EventDesignSchema>;

/** Satu layout yang dijual di photobox (desain A2). `id` = kunci layout (preset); harga Rupiah, 1 lembar termasuk. */
export const PhotoboxLayoutSchema = EventDesignSchema.extend({
  price: z.number().int().min(1000).max(10_000_000),
});
export type PhotoboxLayout = z.infer<typeof PhotoboxLayoutSchema>;

/** Mode photobox (FSD §1.5, DECISIONS #70): tamu memilih layout & bayar QRIS; lembar tambahan dibayar setelah foto. */
export const PhotoboxSchema = z.object({
  layouts: z.array(PhotoboxLayoutSchema).min(1).max(8),
  extraPrintPrice: z.number().int().min(0).max(1_000_000),
});
export type Photobox = z.infer<typeof PhotoboxSchema>;

/**
 * Bundle event lokal: `events/{id}/bundle/config.json` + file aset di folder yang sama (TSD §3, §4.1).
 * Fase 1: disalin manual; Fase 2: diunduh dari cloud dengan format yang sama.
 * `assets`: assetId → nama file (overlay, background, font) yang dirujuk `layout`.
 */
export const EventBundleSchema = z
  .object({
    id: z.string().regex(/^[\w-]{1,64}$/),
    name: z.string().min(1).max(120),
    /** Label kecil di atas nama event di layar attract, mis. "The Wedding of" (desain v2 A1). */
    tagline: z.string().min(1).max(40).optional(),
    date: z.string().min(1).max(60),
    layout: LayoutSpecSchema,
    mode: z.enum(["event", "photobox"]).default("event"),
    photobox: PhotoboxSchema.optional(),
    /** Mode event: 2–5 desain dipilih tamu sebelum foto; yang pertama = `layout`. Tanpa ini = satu desain. */
    designs: z.array(EventDesignSchema).min(2).max(5).optional(),
    settings: EventSettingsSchema.default(DEFAULT_SETTINGS),
    assets: z.record(z.string().min(1).max(64), AssetFile).default({}),
  })
  .superRefine((b, ctx) => {
    const layouts = [
      b.layout,
      ...[...(b.photobox?.layouts ?? []), ...(b.designs ?? [])].map((l) => l.layout),
    ];
    const refs = layouts.flatMap((l) => [
      l.overlay?.assetId,
      l.background?.assetId,
      ...l.texts.map((t) => t.fontAssetId),
    ]);
    if (b.mode === "photobox" && !b.photobox)
      ctx.addIssue({ code: "custom", path: ["photobox"], message: "mode photobox tanpa layout" });
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
