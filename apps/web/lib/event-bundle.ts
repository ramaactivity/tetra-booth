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

/** Overlay PNG ke R2 (berbasis hash, immutable). */
export async function storeOverlay(orgId: string, eventId: string, bytes: Uint8Array) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${orgId}/${eventId}/bundle/${sha256}.png`;
  await putObject(key, bytes, "image/png");
  return { file: "overlay.png", sha256, key };
}

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
}): Json {
  // Overlay dibuat untuk kanvas preset template, jadi hanya dipasang di layout dengan preset itu.
  const layoutOf = (id: PresetId) => ({
    id: `${id}-${e.id.slice(0, 8)}`,
    version: 1,
    ...LAYOUT_PRESETS[id].layout,
    background: { color: e.template.background },
    ...(e.overlay && !e.custom && id === e.template.preset ? { overlay: { assetId: "ov" } } : {}),
  });
  const photobox =
    e.mode === "photobox" && e.photobox?.layouts.length
      ? {
          layouts: e.photobox.layouts.map((l) => ({
            id: l.preset,
            name: LAYOUT_PRESETS[l.preset].name,
            info: LAYOUT_PRESETS[l.preset].info,
            price: l.price,
            layout: layoutOf(l.preset),
          })),
          extraPrintPrice: e.photobox.extraPrintPrice,
        }
      : undefined;
  const customLayout = (c: StoredLayout) => ({
    ...c.layout,
    id: `${c.layout.id.slice(0, 8)}-v${c.layout.version}`,
  });
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
        const pre = `d${i + 1}-`;
        const re = (id: string | undefined) => (id && id in x.custom.files ? pre + id : id);
        const l = customLayout(x.custom);
        return {
          design: design(x.name, {
            ...l,
            ...(l.overlay && { overlay: { ...l.overlay, assetId: re(l.overlay.assetId) ?? "" } }),
            ...(l.background && {
              background: { ...l.background, assetId: re(l.background.assetId) },
            }),
            texts: l.texts.map((t) => ({ ...t, fontAssetId: re(t.fontAssetId) ?? t.fontAssetId })),
          }),
          files: Object.entries(x.custom.files).map(([k, f]) => ({
            id: pre + k,
            ...f,
            file: pre + f.file,
          })),
        };
      });
  const main = e.custom
    ? Object.entries(e.custom.files).map(([id, f]) => ({ id, ...f }))
    : e.overlay
      ? [{ id: "ov", ...e.overlay }]
      : [];
  const all = [...main, ...extras.flatMap((x) => x.files)];
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
    settings: EventSettingsSchema.parse(e.settings ?? {}),
    assets: Object.fromEntries(all.map((f) => [f.id, f.file])),
  });
  const { id: _id, ...rest } = config;
  const files = all.map(({ id: _i, ...f }) => f);
  const stored: StoredBundle = { config: rest, files };
  return stored as unknown as Json;
}
