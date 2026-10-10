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

/**
 * Isi kv → override; rusak/kosong = tanpa override (bundle cloud apa adanya). Override menyimpan nilai cloud saat
 * disimpan (`base`); kalau admin mengubah nilai itu sesudahnya, nilai admin yang berlaku (#255). Override lama tanpa
 * `base` tetap berlaku.
 */
export const parseOverride = (
  raw: string | null,
  cloud?: EventBundle["settings"],
): EventOverride => {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as { base?: Record<string, unknown> };
    const r = EventOverride.safeParse(j);
    if (!r.success) return {};
    if (!cloud || !j.base) return r.data;
    const base = j.base;
    return Object.fromEntries(
      Object.entries(r.data).filter(([k]) => !(k in base) || base[k] === cloud[k as OverrideKey]),
    ) as EventOverride;
  } catch {
    return {};
  }
};
type OverrideKey = (typeof OVERRIDE_KEYS)[number];

/** Override untuk disimpan di kv, beserta nilai cloud saat itu (`base`). */
export const storeOverride = (cloud: EventBundle["settings"], o: EventOverride): string =>
  Object.keys(o).length
    ? JSON.stringify({
        ...o,
        base: Object.fromEntries(Object.keys(o).map((k) => [k, cloud[k as OverrideKey]])),
      })
    : "";

/** Hanya field yang berbeda dari cloud yang disimpan; sama dengan cloud = bukan override. */
export const diffOverride = (cloud: EventBundle["settings"], next: EventOverride): EventOverride =>
  Object.fromEntries(
    OVERRIDE_KEYS.flatMap((k) =>
      next[k] !== undefined && next[k] !== cloud[k] ? [[k, next[k]]] : [],
    ),
  );

/**
 * Photobox: `maxPrints` tidak di-override — server membatasi lembar tambahan dari nilai cloud (priceFor), jadi
 * batas lokal lebih besar membuat tagihan tambahan ditolak.
 */
export const applyOverride = <B extends EventBundle>(b: B, o: EventOverride): B => {
  const { maxPrints, ...rest } = o;
  const eff = b.mode === "photobox" ? rest : o;
  return Object.keys(eff).length ? { ...b, settings: { ...b.settings, ...eff } } : b;
};
