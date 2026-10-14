import { z } from "zod";

/**
 * Antrean bernomor photobox (walk-in mall/kafe): nomor dibuat di laptop (offline), tersimpan di SQLite, mulai dari 1
 * lagi setiap hari. Cukup dua angka: `issued` = nomor terakhir yang diambil, `served` = nomor yang sudah dapat giliran
 * (sesinya mulai, atau dilewati crew). Nomor yang dipanggil sekarang = `served + 1` selama masih ada yang mengambil.
 */
export type QueueState = { day: string; issued: number; served: number };

/**
 * `take` = tamu mengambil nomor; `start` = paket sesi photobox lunas (giliran nomor yang dipanggil terpakai);
 * `next` = crew melewati nomor yang dipanggil (tidak datang) → panggil nomor berikutnya.
 */
export const QueueActionSchema = z.enum(["take", "start", "next"]);
export type QueueAction = z.infer<typeof QueueActionSchema>;

/** Keadaan tersimpan dari kv; rusak / tidak ada / hari lain = antrean baru dari 1. */
export function queueLoad(raw: string | null, day: string): QueueState {
  const fresh = { day, issued: 0, served: 0 };
  try {
    const q = JSON.parse(raw ?? "null") as Partial<QueueState> | null;
    const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
    return q?.day === day && ok(q.issued) && ok(q.served) && q.served <= q.issued
      ? { day, issued: q.issued, served: q.served }
      : fresh;
  } catch {
    return fresh;
  }
}

export function queueReduce(q: QueueState, a: QueueAction): QueueState {
  if (a === "take") return { ...q, issued: q.issued + 1 };
  // start/next hanya memakai nomor yang sedang dipanggil; tanpa antrean = tidak berubah.
  return q.served < q.issued ? { ...q, served: q.served + 1 } : q;
}

/** Nomor yang dipanggil sekarang (null = tidak ada yang antre) dan jumlah yang menunggu di belakangnya. */
export const queueCalled = (q: QueueState) => (q.served < q.issued ? q.served + 1 : null);
export const queueWaiting = (q: QueueState) => Math.max(0, q.issued - q.served);
