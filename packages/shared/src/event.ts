import { z } from "zod";
import { PHOTO_FILTER_IDS } from "./filters";
import { GuestCamSettingsSchema } from "./guest-cam";
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
  /** Bunyi "tik" tiap detik hitung mundur + bunyi jepret (DECISIONS #102). */
  countdownSound: z.boolean().default(false),
  /** Kalimat sebelum / setelah foto (#103); kosong = kalimat bawaan booth. */
  /** Rekam video saat hitung mundur (#117) → aset `video` di halaman tamu. */
  countdownVideo: z.boolean().default(false),
  /** Video bumper Tetra saat event dibuka di booth terpasang (#105). */
  bumper: z.boolean().default(true),
  /** Filter yang ditawarkan ke tamu setelah cek foto (#116); kosong = tanpa langkah filter. */
  filters: z.array(z.enum(PHOTO_FILTER_IDS)).max(5).default([]),
  promptsBefore: z.array(z.string().min(1).max(40)).max(10).default([]),
  promptsAfter: z.array(z.string().min(1).max(40)).max(10).default([]),
  /** Photo Stage (#181): daftar grup foto dari klien/WO (urutan foto pelaminan), pilihan cepat di laptop stage. */
  stageGroups: z.array(z.string().min(1).max(120)).max(300).default([]),
  /** Polaroid & 2R (#207): sisi kiri/kanan (atas/bawah) memakai foto berbeda → jepretan per sesi ×2. */
  pairDifferent: z.boolean().default(false),
  /** Photo Stage (#192): pisah otomatis bawaan (dtk) untuk laptop stage yang belum pernah mengaturnya. */
  stageGapSec: z.number().int().min(15).max(180).default(45),
  /** Photo Stage (#192): lama rombongan tampil di TV setelah jepretan terakhir (dtk). */
  stageTvSec: z.number().int().min(10).max(120).default(30),
  /** Guest Cam (#197): kamera HP tamu lewat /c/{slug}. */
  guestCam: GuestCamSettingsSchema.default(GuestCamSettingsSchema.parse({})),
});
export type EventSettings = z.infer<typeof EventSettingsSchema>;
export const DEFAULT_SETTINGS: EventSettings = EventSettingsSchema.parse({});

/** Nama file aset di folder bundle: tanpa path, tanpa `..`. */
const AssetFile = z
  .string()
  .regex(
    /^[\w][\w.-]*\.(png|jpg|jpeg|gif|mp4|webm|ttf|otf|woff2|wav|mp3)$/i,
    "nama file aset tidak valid",
  );

/** Momen suara booth (#103/#104). Nama = file bawaan `sounds/<cue>.wav` di booth dan web admin. */
export const SOUND_CUES = [
  "mulai",
  "foto-1",
  "foto-2",
  "foto-3",
  "foto-terakhir",
  "3",
  "2",
  "1",
  "jepret",
  "keren-1",
  "keren-2",
  "keren-3",
  "keren-4",
  "review",
  "cetak",
  "selesai",
  "bayar",
  "bumper",
] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

/** Layar awal booth per event (DECISIONS #102): warna/gambar latar, teks tombol, strip contoh. */
export const AttractSchema = z.object({
  background: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  /** assetId latar: gambar (PNG/JPG/GIF) atau video loop (MP4/WebM), ditarik penuh ke layar (#115). */
  imageAssetId: z.string().min(1).max(64).optional(),
  /** Brand label (#115), mis. "@tetraphoto": di layar awal & layar QR. */
  brand: z.string().min(1).max(40).optional(),
  cta: z.string().min(1).max(30).optional(),
  samples: z.boolean().default(true),
});
export type Attract = z.infer<typeof AttractSchema>;

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

const Hhmm = z.string().regex(/^\d{2}:\d{2}$/);
export const EventInfoSchema = z.object({
  scheduledStart: Hhmm.optional(),
  scheduledEnd: Hhmm.optional(),
  packageName: z.string().max(80).optional(),
  packageHours: z.number().positive().max(48).optional(),
  slug: z
    .string()
    .regex(/^[\w-]{1,80}$/)
    .optional(),
  /** Galeri acara `/l/{slug}` bisa dibuka tamu (galeri publik dinyalakan klien + link live aktif, #199). */
  publicGallery: z.boolean().optional(),
});
export type EventInfo = z.infer<typeof EventInfoSchema>;

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
    /**
     * Mode event: desain dipilih tamu sebelum foto; yang pertama = `layout`. Admin kini membatasi 3 (#125), tapi
     * booth tetap menerima sampai 5 supaya bundle lama (≤ 5, #99) tidak ditolak setelah booth update.
     */
    designs: z.array(EventDesignSchema).min(2).max(5).optional(),
    attract: AttractSchema.optional(),
    /** Per suara (#104): "off" = dimatikan, selain itu assetId file pengganti; tidak ada = suara bawaan booth. */
    sounds: z.partialRecord(z.enum(SOUND_CUES), z.string().min(1).max(64)).optional(),
    settings: EventSettingsSchema.default(DEFAULT_SETTINGS),
    /** Info rekap booth (#154), diisi server saat bundle diunduh: jadwal, paket, slug link galeri. */
    info: EventInfoSchema.optional(),
    assets: z.record(z.string().min(1).max(64), AssetFile).default({}),
  })
  .superRefine((b, ctx) => {
    const layouts = [
      b.layout,
      ...[...(b.photobox?.layouts ?? []), ...(b.designs ?? [])].map((l) => l.layout),
    ];
    const refs = [
      b.attract?.imageAssetId,
      ...Object.values(b.sounds ?? {}).filter((v) => v !== "off"),
      ...layouts.flatMap((l) => [
        l.overlay?.assetId,
        l.background?.assetId,
        ...l.texts.map((t) => t.fontAssetId),
      ]),
    ];
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
