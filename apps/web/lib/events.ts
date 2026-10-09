import { EventSettingsSchema, parseRun, type RunState, runState } from "@tetra/shared";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Kolom pencari event dari segmen URL admin `/admin/events/[id]`: URL memakai slug (DECISIONS #146),
 * UUID lama (bookmark/link lama) tetap diterima. Pakai: `.eq(eventKey(id), id).eq("organization_id", orgId)`.
 */
export const eventKey = (idOrSlug: string): "id" | "slug" => (UUID.test(idOrSlug) ? "id" : "slug");

/** Tanggal kalender WIB `YYYY-MM-DD`. */
export const ymdWib = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(ms));

export type EventPhase = "mendatang" | "berlangsung" | "selesai";
/**
 * Fase event untuk tampilan (daftar admin, portal Ops #173). `events.status` tidak dipakai karena tidak pernah
 * berpindah ke `completed`. Timer jalan/dijeda = berlangsung walau tanggalnya lewat (event lewat tengah malam).
 */
export const eventPhase = (eventDate: string, run: RunState, today: string): EventPhase =>
  run === "running" || run === "paused" || eventDate === today
    ? "berlangsung"
    : eventDate > today
      ? "mendatang"
      : "selesai";

/**
 * Foto Guest Cam boleh dilihat (#197): reveal "live", dibuka owner (`guest_revealed_at`), atau acara selesai
 * (Hentikan Acara / tanggal lewat). Dipakai halaman tamu, galeri klien/publik, live, dan ZIP.
 */
export const guestPhotosVisible = (
  ev: { settings: unknown; run: unknown; event_date: string; guest_revealed_at: string | null },
  now = Date.now(),
) => {
  const cam = EventSettingsSchema.safeParse(ev.settings ?? {}).data?.guestCam;
  if (cam?.reveal === "live" || ev.guest_revealed_at) return true;
  const run = runState(parseRun(ev.run));
  return run === "finished" || eventPhase(ev.event_date, run, ymdWib(now)) === "selesai";
};
