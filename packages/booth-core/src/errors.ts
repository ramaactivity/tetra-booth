/** Teks error yang terbaca di log (DOMException/Error jadi "Nama: pesan", bukan "[object DOMException]"). */
export const errText = (e: unknown): string =>
  e instanceof Error || e instanceof DOMException ? `${e.name}: ${e.message}` : String(e);

/** Pesan error untuk crew di layar: tanpa awalan IPC Electron ("Error invoking remote method 'x': Error: "). */
export const crewText = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).replace(
    /^Error invoking remote method '[^']+': (\w*Error: )?/,
    "",
  );
