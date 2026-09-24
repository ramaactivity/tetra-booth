import { Check } from "lucide-react";
import QRCode from "qrcode";
import { type ReactNode, useEffect, useMemo, useState } from "react";

/** Wordmark sementara "T tetra" (ganti logo resmi bila ada). */
export function Logo() {
  return (
    <div className="flex items-center gap-3.5">
      <span className="flex size-12 items-center justify-center rounded-xl border-[2.5px] border-ink bg-mint text-[22px] font-extrabold">
        T
      </span>
      <span className="text-[26px] font-extrabold tracking-[-0.02em]">tetra</span>
    </div>
  );
}

/** Lingkaran centang hijau "selesai". */
export function Done({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full border-2 border-ink bg-green text-white ${className}`}
    >
      <Check size={size * 0.5} strokeWidth={3} />
    </span>
  );
}

/** Stepper foto: selesai = hijau ✓, aktif = tinta, belum = putih; penghubung solid/putus-putus. */
export function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center">
      {Array.from({ length: total }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: urutan langkah tetap
        <div key={i} className="flex items-center">
          {i > 0 && (
            <span
              className={`w-9 border-t-[3px] border-ink ${i <= current ? "border-solid" : "border-dashed"}`}
            />
          )}
          {i < current ? (
            <Done />
          ) : (
            <span
              className={`flex size-9 items-center justify-center rounded-full border-2 border-ink text-base font-bold ${i === current ? "bg-ink font-extrabold text-white" : "bg-white"}`}
            >
              {i + 1}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/** QR asli dengan finder pattern bersudut membulat (README v2 §Fidelity). */
export function QrCode({ url, size }: { url: string; size: number }) {
  const { n, d } = useMemo(() => {
    const m = QRCode.create(url, { errorCorrectionLevel: "M" }).modules;
    const n = m.size;
    const finder = (x: number, y: number) =>
      (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
    let d = "";
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) if (!finder(x, y) && m.get(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return { n, d };
  }, [url]);
  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x} y={y} width={7} height={7} rx={1.5} fill="var(--ink)" />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1} fill="#fff" />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.6} fill="var(--ink)" />
    </g>
  );
  return (
    <svg
      viewBox={`0 0 ${n} ${n}`}
      width={size}
      height={size}
      role="img"
      aria-label={url}
      className="block"
    >
      <rect width={n} height={n} fill="#fff" />
      <path d={d} fill="var(--ink)" shapeRendering="crispEdges" />
      {[eye(0, 0), eye(n - 7, 0), eye(0, n - 7)]}
    </svg>
  );
}

/** Ukuran kanvas desain v2: semua ukuran px di layar booth mengacu ke sini. */
const DESIGN = { long: 1920, short: 1080 };

const fitStage = () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const [dw, dh] = w >= h ? [DESIGN.long, DESIGN.short] : [DESIGN.short, DESIGN.long];
  const scale = Math.min(w / dw, h / dh);
  return { scale, width: w / scale, height: h / scale };
};

/**
 * Layar booth di kanvas 1920×1080 (portrait 1080×1920) yang diskalakan ke layar sebenarnya
 * (1366×768, 1920 dengan scaling 125%, jendela dev). Sisi yang lebih panjang dari rasio desain melebar.
 */
export function Stage({ children }: { children: ReactNode }) {
  const [s, setS] = useState(fitStage);
  useEffect(() => {
    const on = () => setS(fitStage());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden bg-paper">
      <div
        style={{ width: s.width, height: s.height, transform: `scale(${s.scale})` }}
        className="relative origin-top-left overflow-hidden"
      >
        {children}
      </div>
    </div>
  );
}
