import { type LayoutSpec, withDefaultQr } from "@tetra/shared";
import jsQR from "jsqr";
import type { ImageLike, RenderContext } from "./types";

type Box = NonNullable<LayoutSpec["qr"]>;

/**
 * QR placeholder di gambar desain (#247): desainer sering menaruh QR contoh (mis. ke tetraphoto.com) di overlay PNG.
 * Kotak persegi yang menutupi QR itu (+6 % tepi supaya QR lama tidak mengintip), atau null kalau tidak ada.
 */
export function qrPlaceholder(data: Uint8ClampedArray, w: number, h: number): Box | null {
  const q = jsQR(data, w, h, { inversionAttempts: "attemptBoth" });
  if (!q) return null;
  const pts = [
    q.location.topRightCorner,
    q.location.bottomLeftCorner,
    q.location.bottomRightCorner,
    q.location.topLeftCorner,
  ];
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const side = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0);
  const pad = side * 0.06;
  const size = Math.round(side + 2 * pad);
  return { x: Math.round(x0 - pad), y: Math.round(y0 - pad), size };
}

const cache = new WeakMap<object, Box | null>();

/**
 * "QR first" (#247): layout tanpa elemen QR mendapat QR halaman tamu. Kalau overlay punya QR placeholder, QR dinamis
 * ditaruh tepat di atasnya; kalau tidak, di pojok kosong (`withDefaultQr`) kecuali `corner: false`. Deteksi sekali
 * per gambar overlay (di-cache).
 */
export function withQr(
  layout: LayoutSpec,
  overlay: ImageLike | undefined,
  ctx: Pick<RenderContext, "createCanvas">,
  corner = true,
): LayoutSpec {
  if (layout.qr) return layout;
  let box: Box | null | undefined = overlay ? cache.get(overlay) : null;
  if (overlay && box === undefined) {
    const { width: W, height: H } = layout.canvas;
    const c = ctx.createCanvas(W, H);
    const g = c.getContext("2d");
    box = null;
    if (g) {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, W, H);
      const ov = layout.overlay;
      g.drawImage(overlay, ov?.x ?? 0, ov?.y ?? 0, ov?.w ?? W, ov?.h ?? H);
      box = qrPlaceholder(g.getImageData(0, 0, W, H).data, W, H);
    }
    cache.set(overlay, box);
  }
  if (box) return { ...layout, qr: box };
  return corner ? withDefaultQr(layout) : layout;
}
