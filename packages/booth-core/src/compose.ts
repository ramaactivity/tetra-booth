import { browserContext, render } from "@tetra/template-engine";
import type { BoothEvent } from "./event";
import type { BoothStorage } from "./platform";
import type { Photo, Strip } from "./session";

const FONT = "Geist Variable";

/** Render layout event (aset & font bundle ikut) dengan foto apa pun; dipakai compose dan test print. */
export async function renderEvent(
  event: BoothEvent,
  photos: ImageBitmap[] | OffscreenCanvas[],
): Promise<OffscreenCanvas> {
  const fonts = event.render?.fonts ?? {};
  if (event.layout.texts.some((t) => !fonts[t.fontAssetId]))
    await document.fonts.load(`40px "${FONT}"`);
  const ctx = { ...browserContext(FONT), fontFamily: (id: string) => fonts[id] ?? FONT };
  return render(
    event.layout,
    {
      photos,
      assets: event.render?.images ?? {},
      vars: { event_name: event.name, date: event.date },
    },
    ctx,
  ) as unknown as OffscreenCanvas;
}

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
    const out = await renderEvent(event, bitmaps);
    const blob = await out.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    const path = `${await storage.sessionDir(sessionId)}/out/strip.jpg`;
    await storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return { path, url: URL.createObjectURL(blob) };
  } finally {
    for (const b of bitmaps) b.close();
  }
}
