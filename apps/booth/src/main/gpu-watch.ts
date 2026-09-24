/**
 * Pemulihan GPU (M-016): Chromium menyalakan ulang proses GPU sendiri, tapi setelah beberapa kali mati
 * (mis. Windows Update memasang driver GPU di tengah event, W-020) booth bisa jatuh ke render software dan melambat.
 * Kalau GPU mati ≥ `maxCrashes` kali dalam `windowMs`, jadwalkan relaunch; relaunch baru dijalankan saat layar
 * kembali ke attract, supaya sesi tamu tidak terpotong.
 */
export const GPU_MAX_CRASHES = 3;
export const GPU_WINDOW_MS = 10 * 60_000;

export function createGpuWatch(opts: {
  relaunch: () => void;
  log: (m: string) => void;
  maxCrashes?: number;
  windowMs?: number;
  now?: () => number;
}) {
  const max = opts.maxCrashes ?? GPU_MAX_CRASHES;
  const windowMs = opts.windowMs ?? GPU_WINDOW_MS;
  const now = opts.now ?? Date.now;
  let crashes: number[] = [];
  let pending = false;
  let atAttract = true;

  const maybeRelaunch = () => {
    if (pending && atAttract) {
      pending = false;
      opts.log("[gpu] relaunch booth untuk memulihkan akselerasi GPU");
      opts.relaunch();
    }
  };

  return {
    gpuGone(reason: string) {
      const t = now();
      crashes = [...crashes.filter((c) => t - c < windowMs), t];
      opts.log(
        `[gpu] proses GPU mati (${reason}), ${crashes.length}× dalam ${windowMs / 60_000} menit`,
      );
      if (crashes.length >= max && !pending) {
        pending = true;
        crashes = [];
        opts.log("[gpu] relaunch dijadwalkan saat layar kembali ke attract");
        maybeRelaunch();
      }
    },
    phase(p: string) {
      atAttract = p === "attract";
      maybeRelaunch();
    },
    get pending() {
      return pending;
    },
  };
}
