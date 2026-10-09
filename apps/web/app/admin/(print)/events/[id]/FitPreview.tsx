"use client";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Pratinjau kartu QR yang selalu muat utuh di layar (#230): ukuran asli (mm) diperkecil/diperbesar `transform` sesuai
 * ruang yang ada, maks. 1,6×. Saat dicetak transform dilepas, jadi PDF tetap ukuran asli.
 */
export function FitPreview({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ s: number; w: number; h: number } | null>(null);
  useEffect(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    const measure = () => {
      const w = i.offsetWidth;
      const h = i.offsetHeight;
      const s = Math.min(1.6, (b.clientWidth - 64) / w, (b.clientHeight - 64) / h);
      setFit({ s, w, h });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(b);
    measure();
    return () => ro.disconnect();
  }, []);
  return (
    <div
      ref={box}
      className="flex min-h-0 min-w-0 items-center justify-center overflow-hidden print:block print:overflow-visible"
    >
      <div
        className="print:!h-auto print:!w-auto"
        style={fit ? { width: fit.w * fit.s, height: fit.h * fit.s } : { visibility: "hidden" }}
      >
        <div
          ref={inner}
          className="w-max origin-top-left print:!transform-none"
          style={fit ? { transform: `scale(${fit.s})` } : undefined}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
