import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { LiveFrame } from "../platform";

/**
 * Panduan bingkai (DECISIONS #107): area frame kamera yang masuk ke slot (template engine: cover, potong tengah),
 * dalam koordinat layar. Kamera `camW×camH` digambar cover ke layar `cw×ch`; `aspect` = lebar/tinggi slot.
 */
export function guideRect(camW: number, camH: number, cw: number, ch: number, aspect: number) {
  const [w, h] = aspect > camW / camH ? [camW, camW / aspect] : [camH * aspect, camH];
  const scale = Math.max(cw / camW, ch / camH);
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
}: {
  onFrame?: (frame: LiveFrame) => void;
  /** Rasio lebar/tinggi slot foto ini: area di luar potongan digelapkan (#107). */
  guide?: number | undefined;
} = {}) {
  const { camera, mirrorLiveView = true } = usePlatform();
  // Callback terbaru tanpa memulai ulang live view (frame DSLR ditutup tepat setelah callback).
  const frameCb = useRef(onFrame);
  frameCb.current = onFrame;
  const guideRef = useRef(guide);
  guideRef.current = guide;
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
        frameCb.current?.(frame);
        const dpr = window.devicePixelRatio || 1;
        const cw = Math.round(canvas.clientWidth * dpr);
        const ch = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        const scale = Math.max(cw / width, ch / height);
        const dw = width * scale;
        const dh = height * scale;
        if (mirrorLiveView) g.setTransform(-1, 0, 0, 1, cw, 0);
        else g.setTransform(1, 0, 0, 1, 0, 0);
        g.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        const aspect = guideRef.current;
        if (aspect) {
          g.setTransform(1, 0, 0, 1, 0, 0);
          const r = guideRect(width, height, cw, ch, aspect);
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
      })
      .catch((e: unknown) => console.warn(`[liveview] gagal mulai: ${errText(e)}`));
    return () => {
      void camera.stopLiveView();
    };
  }, [camera, mirrorLiveView]);

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
