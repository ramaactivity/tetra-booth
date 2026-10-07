/** Gagal memanggil cloud. `status` = kode HTTP dari server; kosong = tidak sampai ke server (offline / timeout). */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/**
 * Pesan untuk crew dari kegagalan aksi cloud (#170): hanya offline yang disebut "butuh internet"; ditolak server
 * dijelaskan apa yang harus dilakukan. `offline` = kalimat khusus aksi itu.
 */
export function cloudErrorText(e: unknown, offline: string): string {
  const s = e instanceof CloudError ? e.status : undefined;
  if (s === undefined) return offline;
  if (s === 401)
    return "Booth belum dipasangkan atau perlu dipasangkan ulang. Buka menu crew → Sambungkan ke akun Tetra.";
  if (s === 404)
    return "Booth ini tidak ditugaskan ke event ini. Minta admin menugaskan booth ini di Pengaturan event, lalu coba lagi.";
  if (s >= 500) return "Server sedang bermasalah, coba lagi sebentar lagi.";
  return `Server menolak permintaan (kode ${s}). Coba lagi, atau hubungi admin.`;
}
