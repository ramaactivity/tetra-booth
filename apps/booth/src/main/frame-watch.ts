/**
 * Watchdog layar (M-018): di Windows proses GPU bisa mati tanpa `child-process-gone` (W-024: 8/9 kill), lalu
 * jendela beku (0 fps, input mati) sementara main tetap hidup. Main memeriksa tiap `everyMs` apakah renderer
 * masih menghasilkan frame (`probe` = satu requestAnimationFrame); tanpa frame selama `staleMs` → `frozen()`.
 * Jendela tersembunyi/diminimalkan/sedang dimuat tidak dihitung.
 */
export const FRAME_STALE_MS = 15_000;

export function createFrameWatch(opts: {
  probe: () => Promise<unknown>;
  active: () => boolean;
  frozen: () => void;
  staleMs?: number;
  now?: () => number;
}) {
  const staleMs = opts.staleMs ?? FRAME_STALE_MS;
  const now = opts.now ?? Date.now;
  let last = now();
  let fired = false;

  return {
    tick() {
      if (fired) return;
      if (!opts.active()) {
        last = now();
        return;
      }
      // Probe yang tidak pernah selesai (renderer beku/crash) dibiarkan; yang dihitung hanya frame terakhir.
      opts.probe().then(
        () => {
          last = now();
        },
        () => {},
      );
      if (now() - last > staleMs) {
        fired = true;
        opts.frozen();
      }
    },
  };
}
