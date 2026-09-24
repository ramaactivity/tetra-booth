import { useEffect, useRef } from "react";
import { usePlatform } from "../PlatformContext";

/** Live view full-bleed, di-mirror seperti cermin (FSD §1.7). Hasil foto tidak di-mirror. */
export function LiveView() {
  const { camera } = usePlatform();
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext("2d");
    if (!canvas || !g) return;
    camera
      .startLiveView(({ source, width, height }) => {
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
        g.setTransform(-1, 0, 0, 1, cw, 0);
        g.drawImage(source, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      })
      .catch((e: unknown) => console.warn("[liveview] gagal mulai", e));
    return () => {
      void camera.stopLiveView();
    };
  }, [camera]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full bg-fg" />;
}
