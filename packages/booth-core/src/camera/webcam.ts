import { cpuCanvas } from "@tetra/template-engine";
import type { BoothCamera, BoothStorage } from "../platform";
import { rawPath, toJpeg } from "./encode";

// ImageCapture belum ada di lib.dom TypeScript.
declare class ImageCapture {
  constructor(track: MediaStreamTrack);
  getPhotoCapabilities(): Promise<{ imageWidth: { max: number }; imageHeight: { max: number } }>;
  takePhoto(settings?: { imageWidth?: number; imageHeight?: number }): Promise<Blob>;
}

/**
 * Kamera uji Fase 1: webcam lewat getUserMedia (DECISIONS #26).
 * Riset W-010 (HP 5MP): tanpa ukuran eksplisit Chromium memberi 640×480; max 2560×1920 @30 fps.
 * `takePhoto` hanya meng-encode frame stream ke PNG (1,3–3,1 s), sedangkan frame video → JPEG 0,1–0,2 s.
 * Jadi foto = frame video; `takePhoto` hanya kalau webcam punya mode still lebih besar dari stream.
 */
export function createWebcamCamera(storage: BoothStorage, deviceId?: string): BoothCamera {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let stillIsLarger = false;
  let raf = 0;

  const open = async () => {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 2560 },
        height: { ideal: 1920 },
        frameRate: { ideal: 30 },
        // Webcam pilihan crew; kalau sudah dicabut, getUserMedia memakai webcam lain.
        ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
      },
    });
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    await v.play();
    video = v;
    const track = stream.getVideoTracks()[0];
    stillIsLarger = false;
    if (track && "ImageCapture" in globalThis) {
      const caps = await new ImageCapture(track).getPhotoCapabilities().catch(() => null);
      stillIsLarger = (caps?.imageWidth.max ?? 0) > v.videoWidth;
    }
    console.info(
      `[webcam] ${v.videoWidth}×${v.videoHeight}, foto: ${stillIsLarger ? "takePhoto" : "frame video"}`,
    );
  };
  const close = () => {
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null;
    video = null;
  };
  /**
   * Stream masih hidup? Windows bisa mengakhiri/membisukan track webcam saat jendela diperkecil atau kamera
   * direbut aplikasi lain (#170); live view & jepret berikutnya membuka ulang getUserMedia, bukan gagal.
   */
  let reopening: Promise<void> | null = null;
  const ready = () => {
    const track = stream?.getVideoTracks()[0];
    if (video && track?.readyState === "live" && !track.muted) return Promise.resolve();
    if (track)
      console.warn(
        `[webcam] track ${track.readyState}${track.muted ? " (muted)" : ""}, buka ulang`,
      );
    reopening ??= (async () => {
      close();
      await open();
    })().finally(() => {
      reopening = null;
    });
    return reopening;
  };
  const grabFrame = (v: HTMLVideoElement) => {
    const c = cpuCanvas(v.videoWidth, v.videoHeight);
    c.getContext("2d")?.drawImage(v, 0, 0);
    return c.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  };
  const takeStill = async (track: MediaStreamTrack, v: HTMLVideoElement) => {
    try {
      const ic = new ImageCapture(track);
      const caps = await ic.getPhotoCapabilities();
      return await ic.takePhoto({
        imageWidth: caps.imageWidth.max,
        imageHeight: caps.imageHeight.max,
      });
    } catch {
      return grabFrame(v);
    }
  };

  return {
    async startLiveView(onFrame) {
      await ready();
      cancelAnimationFrame(raf);
      const loop = () => {
        const v = video;
        if (v?.videoWidth) onFrame({ source: v, width: v.videoWidth, height: v.videoHeight });
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    },
    async stopLiveView() {
      cancelAnimationFrame(raf);
    },
    async capture({ sessionId, index }) {
      await ready();
      const track = stream?.getVideoTracks()[0];
      if (track?.readyState !== "live" || !track || !video) throw new Error("webcam tidak aktif");
      const blob = stillIsLarger ? await takeStill(track, video) : await grabFrame(video);
      const { bytes, width, height } = await toJpeg(blob);
      const path = rawPath(await storage.sessionDir(sessionId), index);
      await storage.writeFile(path, bytes);
      return { path, width, height };
    },
    async reconnect() {
      cancelAnimationFrame(raf);
      close();
      await open();
    },
  };
}
