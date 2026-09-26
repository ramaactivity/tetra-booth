import "server-only";
import { createHash } from "node:crypto";
import type { Json } from "@tetra/db";
import {
  EventBundleSchema,
  EventSettingsSchema,
  LAYOUT_PRESETS,
  type LayoutPaper,
  type PresetId,
  paperLabel,
  type SoundCue,
  type StoredBundle,
} from "@tetra/shared";
import { longDate } from "@/lib/guest";
import type { StoredLayout } from "@/lib/layouts";
import type { PhotoboxSettings } from "@/lib/payments";
import { putObject } from "@/lib/r2";

/**
 * Pengaturan event di admin (E3) → bundle booth (format EventBundleSchema, DECISIONS #57/#66).
 * `events.settings` = EventSettings + pilihan template; `events.branding` = tagline, klien, warna latar.
 */
/** `layoutId`/`layoutVersion` = template editor (E4) yang dikunci saat pengaturan disimpan; kosong = preset. */
export type EventTemplate = {
  preset: PresetId;
  background: string;
  layoutId?: string;
  layoutVersion?: number;
  /** Mode event (DECISIONS #99): desain tambahan pilihan tamu, `<preset>` atau `tpl:<layoutId>`; maks. 4. */
  extras?: string[];
};
/** Satu layout photobox di bundle + file asetnya (divalidasi EventBundleSchema). */
type PbItem = {
  entry: Record<string, unknown>;
  files: ({ id: string } & StoredBundle["files"][number])[];
};
/** Desain tambahan yang sudah di-resolve: preset, atau versi template editor (terkunci saat simpan). */
export type ExtraDesign = { preset: PresetId } | { name: string; custom: StoredLayout };
/** `color` + `logoKey` (R2) hanya untuk header halaman tamu, tidak masuk bundle booth. */
export type EventBranding = {
  tagline?: string;
  clientName?: string;
  color?: string;
  logoKey?: string;
};

export const DEFAULT_TEMPLATE: EventTemplate = { preset: "strip-3", background: "#ffffff" };

/** File bundle ke R2 (berbasis hash, immutable): overlay PNG, gambar latar layar awal (#102). */
export async function storeBundleFile(
  orgId: string,
  eventId: string,
  bytes: Uint8Array,
  file: string,
  contentType: string,
) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${orgId}/${eventId}/bundle/${sha256}.${file.split(".").pop()}`;
  await putObject(key, bytes, contentType);
  return { file, sha256, key };
}
export const storeOverlay = (orgId: string, eventId: string, bytes: Uint8Array) =>
  storeBundleFile(orgId, eventId, bytes, "overlay.png", "image/png");

/** Pengaturan layar awal di `events.settings.attract` (tanpa gambar; gambarnya file bundle `attract.*`). */
export type AttractSettings = { background?: string; cta?: string; samples: boolean };

/** Bundle lengkap siap disimpan di events.bundle (jsonb); gagal validasi → Error (tidak pernah menyimpan bundle rusak). */
export function buildBundle(e: {
  id: string;
  name: string;
  eventDate: string;
  settings: unknown;
  template: EventTemplate;
  branding: EventBranding;
  overlay: StoredBundle["files"][number] | null;
  mode?: "event" | "photobox";
  photobox?: PhotoboxSettings | null;
  /** Versi template editor; menggantikan preset + overlay event untuk layout utama. */
  custom?: StoredLayout | null;
  /** Nama template editor utama (kartu pilih desain di booth). */
  customName?: string;
  extras?: ExtraDesign[];
  /** Photobox: versi template editor yang dijual, per layoutId (#108). */
  pbTemplates?: Record<string, { name: string; custom: StoredLayout }>;
  attract?: AttractSettings;
  /** Gambar latar layar awal (file bundle `attract.jpg`/`attract.png`). */
  attractImage?: StoredBundle["files"][number] | null;
  /** Suara per cue (#104): "off", atau file pengganti (`snd-<cue>.<ext>`). */
  sounds?: Partial<Record<SoundCue, "off" | StoredBundle["files"][number]>>;
}): Json {
  // Overlay dibuat untuk kanvas preset template, jadi hanya dipasang di layout dengan preset itu.
  const layoutOf = (id: PresetId) => ({
    id: `${id}-${e.id.slice(0, 8)}`,
    version: 1,
    ...LAYOUT_PRESETS[id].layout,
    background: { color: e.template.background },
    ...(e.overlay && !e.custom && id === e.template.preset ? { overlay: { assetId: "ov" } } : {}),
  });
  const customLayout = (c: StoredLayout) => ({
    ...c.layout,
    id: `${c.layout.id.slice(0, 8)}-v${c.layout.version}`,
  });
  /** Template editor tambahan di bundle: asset id, nama file, dan rujukan layout diberi awalan `pre`. */
  const prefixed = (c: StoredLayout, pre: string) => {
    const re = (id: string | undefined) => (id && id in c.files ? pre + id : id);
    const l = customLayout(c);
    return {
      layout: {
        ...l,
        ...(l.overlay && { overlay: { ...l.overlay, assetId: re(l.overlay.assetId) ?? "" } }),
        ...(l.background && { background: { ...l.background, assetId: re(l.background.assetId) } }),
        texts: l.texts.map((t) => ({ ...t, fontAssetId: re(t.fontAssetId) ?? t.fontAssetId })),
      },
      files: Object.entries(c.files).map(([k, f]) => ({ id: pre + k, ...f, file: pre + f.file })),
    };
  };
  // Photobox (#70/#108): preset, atau template editor (aset berawalan p1-, p2-, …).
  const pbItems =
    e.mode === "photobox" && e.photobox?.layouts.length
      ? e.photobox.layouts.flatMap((l, i): PbItem[] => {
          if ("preset" in l)
            return [
              {
                entry: {
                  id: l.preset,
                  name: LAYOUT_PRESETS[l.preset].name,
                  info: LAYOUT_PRESETS[l.preset].info,
                  price: l.price,
                  layout: layoutOf(l.preset),
                },
                files: [],
              },
            ];
          const t = e.pbTemplates?.[l.template];
          if (!t) return [];
          const p = prefixed(t.custom, `p${i + 1}-`);
          return [
            {
              entry: {
                id: `tpl-${l.template}`,
                name: t.name.slice(0, 40),
                info: paperLabel(p.layout.paper as LayoutPaper).slice(0, 40),
                price: l.price,
                layout: p.layout,
              },
              files: p.files,
            },
          ];
        })
      : [];
  const photobox = pbItems.length
    ? {
        layouts: pbItems.map((x) => x.entry),
        extraPrintPrice: e.photobox?.extraPrintPrice ?? 0,
      }
    : undefined;
  const layout = e.custom ? customLayout(e.custom) : layoutOf(e.template.preset);
  const design = (name: string, l: typeof layout) => ({
    id: l.id,
    name: name.slice(0, 40),
    info: paperLabel(l.paper as LayoutPaper).slice(0, 40),
    layout: l,
  });
  // Desain tambahan (#99): aset template editor diberi awalan d1-, d2-, … supaya tidak bentrok di bundle.
  const extras = photobox
    ? []
    : (e.extras ?? []).map((x, i) => {
        if ("preset" in x)
          return { design: design(LAYOUT_PRESETS[x.preset].name, layoutOf(x.preset)), files: [] };
        const p = prefixed(x.custom, `d${i + 1}-`);
        return { design: design(x.name, p.layout), files: p.files };
      });
  const main = e.custom
    ? Object.entries(e.custom.files).map(([id, f]) => ({ id, ...f }))
    : e.overlay
      ? [{ id: "ov", ...e.overlay }]
      : [];
  const bg = e.attractImage ? [{ id: "attract", ...e.attractImage }] : [];
  const snd = Object.entries(e.sounds ?? {}).flatMap(([cue, v]) =>
    v === "off" ? [] : [{ id: `snd-${cue}`, ...v }],
  );
  const all = [
    ...main,
    ...extras.flatMap((x) => x.files),
    ...pbItems.flatMap((x) => x.files),
    ...bg,
    ...snd,
  ];
  const sounds = Object.fromEntries(
    Object.entries(e.sounds ?? {}).map(([cue, v]) => [cue, v === "off" ? v : `snd-${cue}`]),
  );
  const config = EventBundleSchema.parse({
    id: e.id,
    name: e.name,
    ...(e.branding.tagline ? { tagline: e.branding.tagline } : {}),
    date: longDate(e.eventDate),
    layout,
    ...(photobox ? { mode: "photobox", photobox } : {}),
    ...(extras.length && {
      designs: [
        design(
          e.custom ? (e.customName ?? "Desain utama") : LAYOUT_PRESETS[e.template.preset].name,
          layout,
        ),
        ...extras.map((x) => x.design),
      ],
    }),
    ...((e.attract || bg.length) && {
      attract: { ...e.attract, ...(bg.length && { imageAssetId: "attract" }) },
    }),
    ...(Object.keys(sounds).length && { sounds }),
    settings: EventSettingsSchema.parse(e.settings ?? {}),
    assets: Object.fromEntries(all.map((f) => [f.id, f.file])),
  });
  const { id: _id, ...rest } = config;
  const files = all.map(({ id: _i, ...f }) => f);
  const stored: StoredBundle = { config: rest, files };
  return stored as unknown as Json;
}
