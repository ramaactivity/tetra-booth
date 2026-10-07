import type { RunState } from "@tetra/shared";

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
