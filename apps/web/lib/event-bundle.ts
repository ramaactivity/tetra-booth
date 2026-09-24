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
import { putObject } from "@/lib/r2";

/**
 * Pengaturan event di admin (E3) → bundle booth (format EventBundleSchema, DECISIONS #57/#66).
 * `events.settings` = EventSettings + pilihan template; `events.branding` = tagline, klien, warna latar.
 */
export type EventTemplate = { preset: PresetId; background: string };
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
}): Json {
  const preset = LAYOUT_PRESETS[e.template.preset];
  const config = EventBundleSchema.parse({
    id: e.id,
    name: e.name,
    ...(e.branding.tagline ? { tagline: e.branding.tagline } : {}),
    date: longDate(e.eventDate),
    layout: {
      id: `${e.template.preset}-${e.id.slice(0, 8)}`,
      version: 1,
      ...preset.layout,
      background: { color: e.template.background },
      ...(e.overlay ? { overlay: { assetId: "ov" } } : {}),
    },
    settings: EventSettingsSchema.parse(e.settings ?? {}),
    assets: e.overlay ? { ov: e.overlay.file } : {},
  });
  const { id: _id, ...rest } = config;
  const stored: StoredBundle = { config: rest, files: e.overlay ? [e.overlay] : [] };
  return stored as unknown as Json;
}
