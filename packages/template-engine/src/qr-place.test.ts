import QRCode from "qrcode";
import { describe, expect, it } from "vitest";
import { qrPlaceholder } from "./qr-place";

/** Gambar putih W×H dengan QR (modul `cell` px) di (x, y), RGBA. */
function sheet(W: number, H: number, x: number, y: number, cell: number) {
  const d = new Uint8ClampedArray(W * H * 4).fill(255);
  const qr = QRCode.create("https://tetraphoto.com", { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.modules.get(r, c))
        for (let yy = 0; yy < cell; yy++)
          for (let xx = 0; xx < cell; xx++) {
            const i = ((y + r * cell + yy) * W + (x + c * cell + xx)) * 4;
            d[i] = d[i + 1] = d[i + 2] = 0;
          }
  return { d, side: n * cell };
}

describe("qrPlaceholder (#247)", () => {
  it("menemukan QR contoh di desain dan menutupinya", () => {
    const { d, side } = sheet(600, 1800, 255, 1547, 4);
    const box = qrPlaceholder(d, 600, 1800);
    expect(box).not.toBeNull();
    if (!box) return;
    expect(box.x).toBeLessThanOrEqual(255);
    expect(box.y).toBeLessThanOrEqual(1547);
    expect(box.x + box.size).toBeGreaterThanOrEqual(255 + side);
    expect(box.y + box.size).toBeGreaterThanOrEqual(1547 + side);
    expect(box.size).toBeLessThan(side * 1.3);
  });
  it("desain tanpa QR = null", () => {
    expect(qrPlaceholder(new Uint8ClampedArray(600 * 900 * 4).fill(255), 600, 900)).toBeNull();
  });
});
