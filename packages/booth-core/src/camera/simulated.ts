import { cpuCanvas } from "@tetra/template-engine";
import type { BoothCamera, BoothStorage } from "../platform";
import { rawPath, toJpeg } from "./encode";

/**
 * Kamera palsu untuk mode demo, test otomatis, dan stress test tanpa hardware.
 * ponytail: di JS, bukan di Camera Service. Sumber simulasi C# ditambah di M8 kalau jalur WebSocket perlu diuji.
 */
export function createSimulatedCamera(storage: BoothStorage): BoothCamera {
  const live = new OffscreenCanvas(1280, 720);
  let raf = 0;

  const paint = (c: OffscreenCanvas, t: number, label: string) => {
    const g = c.getContext("2d");
    if (!g) return;
    const { width: w, height: h } = c;
    g.fillStyle = `hsl(${(t / 40) % 360} 35% 45%)`;
    g.fillRect(0, 0, w, h);
    g.fillStyle = "#f6f4f1";
    g.beginPath();
    g.arc(w / 2 + Math.sin(t / 700) * w * 0.3, h / 2, h * 0.18, 0, Math.PI * 2);
    g.fill();
    g.font = `${Math.round(h * 0.06)}px sans-serif`;
    g.fillText(label, w * 0.04, h * 0.1);
  };

  return {
    async startLiveView(onFrame) {
      cancelAnimationFrame(raf);
      const loop = (t: number) => {
        paint(live, t, "SIMULASI");
        onFrame({ source: live, width: live.width, height: live.height });
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    },
    async stopLiveView() {
      cancelAnimationFrame(raf);
    },
    async capture({ sessionId, index }) {
      const c = cpuCanvas(3000, 2000);
      paint(c, performance.now(), `Foto ${index + 1}`);
      const { bytes, width, height } = await toJpeg(
        await c.convertToBlob({ type: "image/jpeg", quality: 0.9 }),
      );
      const path = rawPath(await storage.sessionDir(sessionId), index);
      await storage.writeFile(path, bytes);
      return { path, width, height };
    },
    async reconnect() {},
  };
}
