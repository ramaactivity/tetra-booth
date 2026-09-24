import { browserContext, render } from "@tetra/template-engine";
import type { BoothEvent } from "./event";
import type { BoothStorage } from "./platform";
import type { Photo, Strip } from "./session";

const FONT = "Geist Variable";

/** Render strip resolusi cetak dari foto sesi lewat template engine bersama (aturan 2), simpan ke out/strip.jpg. */
export async function composeStrip(
  storage: BoothStorage,
  sessionId: string,
  event: BoothEvent,
  photos: Photo[],
): Promise<Strip> {
  const bitmaps = await Promise.all(
    photos.map(async (p) => createImageBitmap(new Blob([await storage.readFile(p.path)]))),
  );
  try {
    if (event.layout.texts.length) await document.fonts.load(`40px "${FONT}"`);
    const out = render(
      event.layout,
      { photos: bitmaps, assets: {}, vars: { event_name: event.name, date: event.date } },
      browserContext(FONT),
    ) as unknown as OffscreenCanvas;
    const blob = await out.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    const path = `${await storage.sessionDir(sessionId)}/out/strip.jpg`;
    await storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return { path, url: URL.createObjectURL(blob) };
  } finally {
    for (const b of bitmaps) b.close();
  }
}
