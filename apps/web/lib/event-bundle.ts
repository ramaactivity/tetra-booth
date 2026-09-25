import "server-only";
import { createHash } from "node:crypto";
import type { Json } from "@tetra/db";
import {
  EventBundleSchema,
  EventSettingsSchema,
  LAYOUT_PRESETS,
  type PresetId,
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
};
export type EventBranding = { tagline?: string; clientName?: string };

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
  const config = EventBundleSchema.parse({
    id: e.id,
    name: e.name,
    ...(e.branding.tagline ? { tagline: e.branding.tagline } : {}),
    date: longDate(e.eventDate),
    layout: e.custom
      ? { ...e.custom.layout, id: `${e.custom.layout.id.slice(0, 8)}-v${e.custom.layout.version}` }
      : layoutOf(e.template.preset),
    ...(photobox ? { mode: "photobox", photobox } : {}),
    settings: EventSettingsSchema.parse(e.settings ?? {}),
    assets: e.custom
      ? Object.fromEntries(Object.entries(e.custom.files).map(([k, f]) => [k, f.file]))
      : e.overlay
        ? { ov: e.overlay.file }
        : {},
  });
  const { id: _id, ...rest } = config;
  const files = e.custom ? Object.values(e.custom.files) : e.overlay ? [e.overlay] : [];
  const stored: StoredBundle = { config: rest, files };
  return stored as unknown as Json;
}
