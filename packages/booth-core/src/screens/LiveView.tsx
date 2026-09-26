import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { usePlatform } from "../PlatformContext";

/**
 * Live view full-bleed, di-mirror seperti cermin (FSD §1.7) kecuali crew mematikannya. Hasil foto tidak di-mirror
 * kecuali opsi crew "Cermin hasil foto" (camera/mirror.ts).
 */
export function LiveView() {
  const { camera, mirrorLiveView = true } = usePlatform();
  const ref = useRef<HTMLCanvasElement>(null);
  const [hasFrame, setHasFrame] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    camera
      .startLiveView(({ source, width, height }) => {
        setHasFrame(true);
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
