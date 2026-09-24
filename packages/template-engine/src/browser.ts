import type { RenderContext } from "./types";

/**
 * OffscreenCanvas dengan konteks 2D di CPU. Konteks pertama mengunci atributnya, jadi `getContext("2d")`
 * berikutnya mendapat konteks yang sama. Canvas GPU menyimpan tekstur foto besar di proses GPU
 * (±500 MB di iGPU Intel, W-020 / M-017); live view tetap memakai canvas biasa.
 */
export const cpuCanvas = (w: number, h: number) => {
  const c = new OffscreenCanvas(w, h);
  c.getContext("2d", { willReadFrequently: true });
  return c;
};

/** RenderContext untuk browser & Electron renderer (OffscreenCanvas). */
export const browserContext = (fontFamily = "Geist Variable"): RenderContext => ({
  createCanvas: cpuCanvas,
  fontFamily: () => fontFamily,
});
