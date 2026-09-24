/** Tunggu sampai `done()` true atau batas waktu habis. Kembalikan true kalau terpenuhi. */
export async function waitUntil(
  done: () => boolean,
  timeoutMs: number,
  stepMs = 250,
): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() >= end) return false;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  return true;
}
