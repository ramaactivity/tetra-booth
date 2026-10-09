/** Teks error yang terbaca di log (DOMException/Error jadi "Nama: pesan", bukan "[object DOMException]"). */
export const errText = (e: unknown): string =>
  e instanceof Error || e instanceof DOMException ? `${e.name}: ${e.message}` : String(e);

/**
 * Jepret gagal karena kamera sibuk / tidak menjawab (bukan terputus): pada bodi yang AF-nya bermasalah (700D unit #1,
 * 9 Okt) solusi di lapangan = saklar fokus lensa ke MF. Dipakai untuk menampilkan saran AF → MF ke crew.
 */
export const afSuspect = (e: unknown): boolean =>
  /tidak menjawab|0x0*81\b|tidak mengirim foto|DEVICE_BUSY|capture_timeout|camera_stuck/i.test(
    e instanceof Error ? e.message : String(e),
  );

/** Pesan error untuk crew di layar: tanpa awalan IPC Electron ("Error invoking remote method 'x': Error: "). */
export const crewText = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (\w*Error: )?/,
    "",
  );
