import type { EventBundle, EventDesign, LayoutSpec, Photobox, SoundCue } from "@tetra/shared";
import type { BoothEvents } from "./platform";
import { DEFAULT_SETTINGS, type EventSettings } from "./session";

export type BoothEvent = {
  /** ID event cloud; "local" sampai event dari bundle ada (M6). */
  id: string;
  name: string;
  tagline?: string | undefined;
  /** Slug event cloud (link galeri `/l/{slug}`, #189); tidak ada = event lokal / bundle lama. */
  slug?: string | undefined;
  /** Galeri acara bisa dibuka tamu (#199); tidak = QR galeri di TV disembunyikan. */
  publicGallery?: boolean | undefined;
  /** Tanggal tampil di strip, mis. "12 Oktober 2026". */
  date: string;
  layout: LayoutSpec;
  settings: EventSettings;
  /** Photobox (Fase 4): layout dijual + harga; tanpa ini = mode event. */
  photobox?: Photobox | undefined;
  /** Layar awal per event (#102); `imageUrl` = object URL gambar latar. */
  attract?:
    | {
        background?: string;
        cta?: string;
        brand?: string;
        samples: boolean;
        imageUrl?: string;
        /** Latar berupa video loop (MP4/WebM, #115). */
        video?: boolean;
      }
    | undefined;
  /** Suara per event (#104): "off" atau object URL file pengganti. */
  sounds?: Partial<Record<SoundCue, string>> | undefined;
  /** Mode event: 2–3 desain pilihan tamu (DECISIONS #99); tanpa ini = satu desain `layout`. */
  designs?: EventDesign[] | undefined;
  /** Aset bundle yang sudah dimuat (overlay/background) + nama font terdaftar per assetId. */
  render?: { images: Record<string, ImageBitmap>; fonts: Record<string, string> };
};

const FONT_FILE = /\.(ttf|otf|woff2)$/i;

/** Lepas object URL milik event (gambar latar, suara pengganti) saat event diganti / dimuat ulang. */
export function releaseEvent(e: BoothEvent) {
  if (e.attract?.imageUrl) URL.revokeObjectURL(e.attract.imageUrl);
  for (const u of Object.values(e.sounds ?? {})) if (u && u !== "off") URL.revokeObjectURL(u);
}

/** Muat bundle jadi event siap render: gambar di-decode, font didaftarkan ke document.fonts. */
export async function loadEvent(bundle: EventBundle, events: BoothEvents): Promise<BoothEvent> {
  const images: Record<string, ImageBitmap> = {};
  const fonts: Record<string, string> = {};
  let imageUrl: string | undefined;
  let video = false;
  const soundIds = new Set(Object.values(bundle.sounds ?? {}));
  const soundUrls: Record<string, string> = {};
  await Promise.all(
    Object.entries(bundle.assets).map(async ([assetId, file]) => {
      const bytes = await events.asset(bundle.id, assetId);
      if (assetId === bundle.attract?.imageAssetId) {
        const ext = file.split(".").pop()?.toLowerCase() ?? "";
        video = ext === "mp4" || ext === "webm";
        imageUrl = URL.createObjectURL(
          new Blob([bytes], { type: video ? `video/${ext}` : ext === "gif" ? "image/gif" : "" }),
        );
      } else if (soundIds.has(assetId)) {
        soundUrls[assetId] = URL.createObjectURL(new Blob([bytes]));
      } else if (FONT_FILE.test(file)) {
        const family = `tb-${bundle.id}-${assetId}`;
        document.fonts.add(await new FontFace(family, bytes).load());
        fonts[assetId] = family;
      } else {
        images[assetId] = await createImageBitmap(new Blob([bytes]));
      }
    }),
  );
  return {
    id: bundle.id,
    name: bundle.name,
    tagline: bundle.tagline,
    slug: bundle.info?.slug,
    publicGallery: bundle.info?.publicGallery,
    date: bundle.date,
    layout: bundle.layout,
    settings: bundle.settings,
    ...(bundle.mode === "photobox"
      ? { photobox: bundle.photobox }
      : bundle.designs && { designs: bundle.designs }),
    ...(bundle.attract && {
      attract: {
        ...(bundle.attract.background && { background: bundle.attract.background }),
        ...(bundle.attract.cta && { cta: bundle.attract.cta }),
        ...(bundle.attract.brand && { brand: bundle.attract.brand }),
        ...(video ? { video: true } : {}),
        samples: bundle.attract.samples,
        ...(imageUrl && { imageUrl }),
      },
    }),
    ...(bundle.sounds && {
      sounds: Object.fromEntries(
        Object.entries(bundle.sounds).map(([cue, v]) => [cue, v === "off" ? v : soundUrls[v]]),
      ),
    }),
    render: { images, fonts },
  };
}

/** Strip klasik 2×6 (dicetak berdua di 4R), 3 foto 3:2. Dipakai sampai event dari bundle ada (M6). */
export const DEFAULT_LAYOUT: LayoutSpec = {
  id: "default-strip",
  version: 1,
  paper: "2x6x2",
  canvas: { width: 600, height: 1800, dpi: 300 },
  background: { color: "#ffffff" },
  slots: [0, 1, 2].map((i) => ({
    id: `s${i + 1}`,
    x: 30,
    y: 30 + i * 390,
    w: 540,
    h: 360,
    fit: "cover" as const,
    z: "below_overlay" as const,
  })),
  texts: [
    {
      x: 30,
      y: 1330,
      w: 540,
      fontAssetId: "geist",
      size: 52,
      color: "#1a1714",
      align: "center",
      value: "{event_name}",
    },
    {
      x: 30,
      y: 1410,
      w: 540,
      fontAssetId: "geist",
      size: 28,
      color: "#8a847d",
      align: "center",
      value: "{date}",
    },
  ],
};

export const DEFAULT_EVENT: BoothEvent = {
  id: "local",
  name: "Tetra Booth",
  date: new Intl.DateTimeFormat("id-ID", { dateStyle: "long" }).format(new Date()),
  layout: DEFAULT_LAYOUT,
  settings: DEFAULT_SETTINGS,
};
