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
 * Live view = elemen video; foto = ImageCapture.takePhoto resolusi maksimum, fallback ambil frame video.
 */
export function createWebcamCamera(storage: BoothStorage): BoothCamera {
  let stream: MediaStream | null = null;
  let video: HTMLVideoElement | null = null;
  let raf = 0;

  const open = async () => {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
    });
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.srcObject = stream;
    await v.play();
    video = v;
  };
  const close = () => {
    cancelAnimationFrame(raf);
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null;
    video = null;
  };
  const grabFrame = (v: HTMLVideoElement) => {
    const c = new OffscreenCanvas(v.videoWidth, v.videoHeight);
    c.getContext("2d")?.drawImage(v, 0, 0);
    return c.convertToBlob({ type: "image/jpeg", quality: 0.95 });
  };

  return {
    async startLiveView(onFrame) {
      if (!video) await open();
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
      if (!video) await open();
      const track = stream?.getVideoTracks()[0];
      if (track?.readyState !== "live" || !track || !video) throw new Error("webcam tidak aktif");
      let blob: Blob;
      try {
        const ic = new ImageCapture(track);
        const caps = await ic.getPhotoCapabilities();
        blob = await ic.takePhoto({
          imageWidth: caps.imageWidth.max,
          imageHeight: caps.imageHeight.max,
        });
      } catch {
        blob = await grabFrame(video);
      }
      const { bytes, width, height } = await toJpeg(blob);
      const path = rawPath(await storage.sessionDir(sessionId), index);
      await storage.writeFile(path, bytes);
      return { path, width, height };
    },
    async reconnect() {
      close();
      await open();
    },
  };
}
