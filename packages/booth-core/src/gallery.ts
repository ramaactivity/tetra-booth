import type { SessionPiece } from "./platform";

/** Galeri tamu (#145): kartu per halaman & lama tanpa sentuhan sebelum kembali ke layar awal. */
export const GALLERY_PAGE = 24;
export const GALLERY_IDLE_MS = 60_000;

/** Sisa lembar yang boleh dicetak lagi dari galeri untuk satu sesi (batas = maxPrints event). */
export const reprintLeft = (max: number, reprinted: number) => Math.max(0, max - reprinted);

/** Kursor halaman berikut (completedAt kartu terakhir); null = sudah habis. */
export const nextCursor = (page: SessionPiece[], limit: number): string | null =>
  page.length < limit ? null : (page.at(-1)?.completedAt ?? null);

/** Jam UTC "YYYY-MM-DDTHH" → kursor tepat setelah jam itu, supaya halaman mulai dari sesi terakhir jam itu. */
export const hourCursor = (hour: string) =>
  new Date(Date.parse(`${hour}:00:00Z`) + 3_600_000).toISOString();

/** Jam UTC sebuah waktu ISO, kunci kelompok yang sama dengan `sessionHours` di DB. */
export const hourOf = (iso: string) => new Date(iso).toISOString().slice(0, 13);

const two = (n: number) => String(n).padStart(2, "0");
/** "14.05" waktu lokal booth. */
export const clock = (iso: string) => {
  const d = new Date(iso);
  return `${two(d.getHours())}.${two(d.getMinutes())}`;
};
/** Label chip/judul jam lokal: "14.00". */
export const hourLabel = (hour: string) => clock(`${hour}:00:00Z`);

/** Kelompokkan kartu (terbaru dulu) per jam, urutan tetap. */
export function byHour(pieces: SessionPiece[]): { hour: string; pieces: SessionPiece[] }[] {
  const out: { hour: string; pieces: SessionPiece[] }[] = [];
  for (const p of pieces) {
    const h = hourOf(p.completedAt);
    const last = out.at(-1);
    if (last?.hour === h) last.pieces.push(p);
    else out.push({ hour: h, pieces: [p] });
  }
  return out;
}

/**
 * Lebar decode (px gambar) untuk kartu yang tampil `cssW` px di kanvas booth: × skala Stage × devicePixelRatio
 * × 2 supaya teks desain tetap tajam; tidak pernah melebihi lebar file (tidak memperbesar).
 */
export const decodeWidth = (cssW: number, stageScale: number, dpr: number, fileW: number) =>
  Math.min(fileW, Math.ceil(cssW * stageScale * dpr * 2));
