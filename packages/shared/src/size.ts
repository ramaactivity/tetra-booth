import { z } from "zod";

/**
 * Ukuran file di laptop booth (#166): isi "Buka Folder Event" (sesi asli). Dikirim saat Hentikan Acara (bersama
 * aksi `finish`) dan setiap rekap booth dibuka saat online (POST /api/booth/events/:id/storage, idempotent).
 */
export const LocalStorage = z.object({
  bytes: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  files: z.number().int().min(0).max(10_000_000),
});
export type LocalStorage = z.infer<typeof LocalStorage>;

const UNITS = ["KB", "MB", "GB", "TB"] as const;
/**
 * Ukuran file ala Windows Explorer (basis 1024, supaya cocok dengan "ruang kosong" flashdisk di Explorer), koma
 * desimal Indonesia: "3,2 GB", "850 MB", "12 KB". Satu desimal hanya di bawah 10 (MB) / di GB ke atas.
 */
export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  const digits = i >= 2 || v < 10 ? 1 : 0;
  return `${v.toLocaleString("id-ID", { maximumFractionDigits: digits })} ${UNITS[i]}`;
}
