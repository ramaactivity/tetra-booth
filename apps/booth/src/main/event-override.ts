import { type EventBundle, EventSettingsSchema } from "@tetra/shared";
import { z } from "zod";

/**
 * Pengaturan event yang boleh diubah crew di booth (DECISIONS #100): override lokal per booth, disimpan di kv
 * SQLite (bukan di folder bundle), jadi Sync dari Cloud tidak menimpanya. Template, harga, lead capture tetap admin.
 */
export const OVERRIDE_KEYS = [
  "countdownSec",
  "retakeMax",
  "maxPrints",
  "qrScreenSec",
  "sessionSec",
] as const;
// Tanpa `.default()` bawaan EventSettingsSchema: field yang tidak diubah harus tetap kosong, bukan nilai default.
const shape = EventSettingsSchema.shape;
export const EventOverride = z.object({
  countdownSec: shape.countdownSec.unwrap().optional(),
  retakeMax: shape.retakeMax.unwrap().optional(),
  maxPrints: shape.maxPrints.unwrap().optional(),
  qrScreenSec: shape.qrScreenSec.unwrap().optional(),
  sessionSec: shape.sessionSec.unwrap().optional(),
});
export type EventOverride = z.infer<typeof EventOverride>;

export const overrideKey = (eventId: string) => `event_override:${eventId}`;

/** Isi kv → override; rusak/kosong = tanpa override (bundle cloud apa adanya). */
export const parseOverride = (raw: string | null): EventOverride => {
  if (!raw) return {};
  try {
    const r = EventOverride.safeParse(JSON.parse(raw));
    return r.success ? r.data : {};
  } catch {
    return {};
  }
};

/** Hanya field yang berbeda dari cloud yang disimpan; sama dengan cloud = bukan override. */
export const diffOverride = (cloud: EventBundle["settings"], next: EventOverride): EventOverride =>
  Object.fromEntries(
    OVERRIDE_KEYS.flatMap((k) =>
      next[k] !== undefined && next[k] !== cloud[k] ? [[k, next[k]]] : [],
    ),
  );

export const applyOverride = <B extends EventBundle>(b: B, o: EventOverride): B =>
  Object.keys(o).length ? { ...b, settings: { ...b.settings, ...o } } : b;
