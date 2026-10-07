import { stampText } from "@tetra/shared";
import { processShot, type ShotJob, type ShotResult } from "./capture-core";

const LONG = 1920;
let worker: Worker | null | undefined;
let seq = 0;
const waiting = new Map<number, (r: ShotResult | null) => void>();

const getWorker = () => {
  if (worker !== undefined) return worker;
  try {
    worker =
      typeof OffscreenCanvas === "undefined"
        ? null
        : new Worker(new URL("./capture.worker.ts", import.meta.url), { type: "module" });
    worker?.addEventListener(
      "message",
      (e: MessageEvent<{ id: number; ok: boolean } & Partial<ShotResult>>) => {
        const done = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        done?.(
          e.data.ok && e.data.main && e.data.thumb
            ? { main: e.data.main, thumb: e.data.thumb }
            : null,
        );
      },
    );
  } catch {
    worker = null;
  }
  return worker;
};

/**
 * Satu jepretan Guest Cam (#209): frame video dipotong tengah ke 3:4 potret (sisi panjang ≤ 1920) sebagai
 * ImageBitmap, lalu diproses di Web Worker (preset, grain, stempel, JPEG) supaya layar tetap mulus. Cadangan:
 * thread utama. Hasil tidak di-mirror (sama dengan booth).
 */
export async function capture(video: HTMLVideoElement, presetId: string, stamp: boolean) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = Math.min(vw, (vh * 3) / 4);
  const ch = (cw * 4) / 3;
  const k = Math.min(1, LONG / ch);
  const job: ShotJob = {
    bmp: await createImageBitmap(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch),
    w: Math.round(cw * k),
    h: Math.round(ch * k),
    presetId,
    stamp: stamp ? stampText(new Date()) : null,
  };
  const wk = getWorker();
  if (wk) {
    const id = ++seq;
    const r = await new Promise<ShotResult | null>((ok) => {
      waiting.set(id, ok);
      wk.postMessage({ id, ...job }, [job.bmp]);
      setTimeout(() => {
        if (waiting.delete(id)) ok(null);
      }, 15_000);
    });
    if (r) return r;
    // Worker gagal (bitmap sudah dipindah): matikan worker, ambil frame baru, proses di thread utama.
    worker?.terminate();
    worker = null;
    return capture(video, presetId, stamp);
  }
  return processShot(job);
}
