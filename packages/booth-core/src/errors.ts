/** Teks error yang terbaca di log (DOMException/Error jadi "Nama: pesan", bukan "[object DOMException]"). */
export const errText = (e: unknown): string =>
  e instanceof Error || e instanceof DOMException ? `${e.name}: ${e.message}` : String(e);
