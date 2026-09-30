import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import type { LiveFrame } from "../platform";

/** Rasio lebar/tinggi slot foto (slot yang diputar 90° ditukar). */
export const slotAspect = (slot: BoothEvent["layout"]["slots"][number] | undefined) => {
  if (!slot) return undefined;
  const turned = Math.abs(Math.round((slot.rotation ?? 0) / 90)) % 2 === 1;
  return turned ? slot.h / slot.w : slot.w / slot.h;
};

/** Batas tunggu frame live view pertama sebelum hitung mundur tetap jalan (DSLR dingin ±1,6 s). */
export const LIVE_WAIT_MS = 2500;
// Per kamera: true = pernah mengirim frame, false = batas tunggu habis tanpa frame (hot folder tanpa live view).
const liveKnown = new WeakMap<object, boolean>();
export const liveSeen = (camera: object) => liveKnown.set(camera, true);
export const liveMissed = (camera: object) => {
  if (!liveKnown.get(camera)) liveKnown.set(camera, false);
};
/** Tunggu frame pertama kecuali kamera ini sudah terbukti tanpa live view (cukup sekali menunggu). */
export const waitsForLive = (camera: object) => liveKnown.get(camera) !== false;

/** Garis bantu Tes Jepret (masukan Rama W-034): sepertiga + margin aman di dalam area slot/foto. */
export type LiveOverlay = { grid?: boolean; safe?: number };

/**
 * Panduan bingkai (DECISIONS #107): area frame kamera yang masuk ke slot (template engine: cover, potong tengah),
 * dalam koordinat layar. Kamera `camW×camH` digambar cover ke layar `cw×ch`; `aspect` = lebar/tinggi slot.
 */
export function guideRect(
  camW: number,
  camH: number,
  cw: number,
  ch: number,
  aspect: number,
  fit: "cover" | "contain" = "cover",
) {
  const [w, h] = aspect > camW / camH ? [camW, camW / aspect] : [camH * aspect, camH];
  const scale = (fit === "cover" ? Math.max : Math.min)(cw / camW, ch / camH);
  return {
    x: (cw - camW * scale) / 2 + ((camW - w) / 2) * scale,
    y: (ch - camH * scale) / 2 + ((camH - h) / 2) * scale,
    w: w * scale,
    h: h * scale,
  };
}

/**
 * Live view full-bleed, di-mirror seperti cermin (FSD §1.7) kecuali crew mematikannya. Hasil foto tidak di-mirror
 * kecuali opsi crew "Cermin hasil foto" (camera/mirror.ts).
 */
export function LiveView({
  onFrame,
  guide,
  fit = "cover",
  overlay,
}: {
  onFrame?: (frame: LiveFrame) => void;
  /** cover = penuh layar (tamu); contain = seluruh frame kamera terlihat (Tes Jepret: framing jujur). */
  fit?: "cover" | "contain";
  overlay?: LiveOverlay | undefined;
  /** Rasio lebar/tinggi slot foto ini: area di luar potongan digelapkan (#107). */
  guide?: number | undefined;
} = {}) {
  const { camera, mirrorLiveView = true } = usePlatform();
  // Callback terbaru tanpa memulai ulang live view (frame DSLR ditutup tepat setelah callback).
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;
  const guideRef = useRef(guide);
  guideRef.current = guide;
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  const ref = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    camera
      .startLiveView((frame) => {
        const { source, width, height } = frame;
        setHasFrame(true);
        liveSeen(camera);
        frameCb.current?.(frame);
        const dpr = window.devicePixelRatio || 1;
        const cw = Math.round(canvas.clientWidth * dpr);
        const ch = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        const scale = (fit === "cover" ? Math.max : Math.min)(cw / width, ch / height);
        if (fit === "contain") g.clearRect(0, 0, cw, ch);
        const dw = width * scale;
        const dh = height * scale;
        if (mirrorLiveView) g.setTransform(-1, 0, 0, 1, cw, 0);
        else g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        const aspect = guideRef.current;
        if (aspect) {
          g.setTransform(1, 0, 0, 1, 0, 0);
          const r = guideRect(width, height, cw, ch, aspect, fit);
          g.fillStyle = "rgba(29, 29, 27, 0.55)";
          g.fillRect(0, 0, cw, r.y);
          g.fillRect(0, r.y + r.h, cw, ch - r.y - r.h);
          g.fillRect(0, r.y, r.x, r.h);
          g.fillRect(r.x + r.w, r.y, cw - r.x - r.w, r.h);
          g.strokeStyle = "#ffffff";
          g.lineWidth = 4 * dpr;
          g.setLineDash([18 * dpr, 12 * dpr]);
          g.strokeRect(r.x, r.y, r.w, r.h);
          g.setLineDash([]);
        }
        const ov = overlayRef.current;
        if (ov?.grid || ov?.safe) {
          g.setTransform(1, 0, 0, 1, 0, 0);
          // Area acuan: potongan slot kalau ada, kalau tidak seluruh foto yang tampil.
          const r = guideRect(width, height, cw, ch, aspect ?? width / height, fit);
          if (ov.grid) {
            g.strokeStyle = "rgba(255,255,255,0.7)";
            g.lineWidth = 2 * dpr;
            g.beginPath();
            for (const k of [1 / 3, 2 / 3]) {
              g.moveTo(r.x + r.w * k, r.y);
              g.lineTo(r.x + r.w * k, r.y + r.h);
              g.moveTo(r.x, r.y + r.h * k);
              g.lineTo(r.x + r.w, r.y + r.h * k);
            }
            g.stroke();
            const c = 14 * dpr;
            g.beginPath();
            g.moveTo(r.x + r.w / 2 - c, r.y + r.h / 2);
            g.lineTo(r.x + r.w / 2 + c, r.y + r.h / 2);
            g.moveTo(r.x + r.w / 2, r.y + r.h / 2 - c);
            g.lineTo(r.x + r.w / 2, r.y + r.h / 2 + c);
            g.stroke();
          }
          if (ov.safe) {
            const m = Math.min(r.w, r.h) * ov.safe;
            g.strokeStyle = "#f7d98b";
            g.lineWidth = 3 * dpr;
            g.setLineDash([10 * dpr, 8 * dpr]);
            g.strokeRect(r.x + m, r.y + m, r.w - 2 * m, r.h - 2 * m);
            g.setLineDash([]);
          }
        }
      })
      .catch((e: unknown) => console.warn(`[liveview] gagal mulai: ${errText(e)}`));
    return () => {
      void camera.stopLiveView();
    };
  }, [camera, mirrorLiveView, fit]);

  return (
    <>
      <canvas ref={ref} className="absolute inset-0 h-full w-full bg-ink" />
      {/* Kamera tanpa live view (hot folder): arahkan tamu ke kamera. */}
      {!hasFrame && (
        <p className="absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full border-[2.5px] border-ink bg-white px-8 py-3.5 text-[26px] font-extrabold whitespace-nowrap">
          {copy.countdown.lookAtCamera}
        </p>
      )}
    </>
  );
}
