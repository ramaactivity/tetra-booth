import type { RenderContext } from "./types";

/** RenderContext untuk browser & Electron renderer (OffscreenCanvas). */
export const browserContext = (fontFamily = "Geist Variable"): RenderContext => ({
  createCanvas: (w, h) => new OffscreenCanvas(w, h),
  fontFamily: () => fontFamily,
});
