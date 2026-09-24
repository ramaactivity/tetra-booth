/**
 * Pemulihan GPU (M-016, M-017): Chromium menyalakan ulang proses GPU sendiri, tapi setelah satu kali mati
 * (mis. Windows Update memasang driver GPU di tengah event, W-020 run ke-2) booth bisa bertahan di software
 * compositing: 2× lebih lambat, renderer ±830 MB. Jadi setiap kali GPU mati, jadwalkan relaunch; relaunch baru
 * dijalankan saat layar kembali ke attract, supaya sesi tamu tidak terpotong.
 */
export function createGpuWatch(opts: { relaunch: () => void; log: (m: string) => void }) {
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
      opts.log(
        `[gpu] proses GPU mati (${reason}), relaunch dijadwalkan saat layar kembali ke attract`,
      );
      pending = true;
      maybeRelaunch();
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
