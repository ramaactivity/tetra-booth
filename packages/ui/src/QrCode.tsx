import QRCode from "qrcode";
import { useMemo } from "react";

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
