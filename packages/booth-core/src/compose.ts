import { browserContext, renderPiece, toSheet } from "@tetra/template-engine";
import type { BoothEvent } from "./event";
import type { BoothStorage } from "./platform";
import type { Photo, Strip } from "./session";

const FONT = "Geist Variable";

/**
 * Render layout event (aset & font bundle ikut) dengan foto apa pun; dipakai compose dan test print.
 * `piece` = satu potong desain (layar & web), `sheet` = lembar cetak 1200×1800 (DECISIONS #78).
 */
export async function renderEvent(
  event: BoothEvent,
  photos: ImageBitmap[] | OffscreenCanvas[],
): Promise<{ piece: OffscreenCanvas; sheet: OffscreenCanvas }> {
  const fonts = event.render?.fonts ?? {};
  if (event.layout.texts.some((t) => !fonts[t.fontAssetId]))
    await document.fonts.load(`40px "${FONT}"`);
  const ctx = { ...browserContext(FONT), fontFamily: (id: string) => fonts[id] ?? FONT };
  const piece = renderPiece(
    event.layout,
    {
      photos,
      assets: event.render?.images ?? {},
      vars: { event_name: event.name, date: event.date },
    },
    ctx,
  );
  const sheet = toSheet(event.layout, piece, ctx);
  return {
    piece: piece as unknown as OffscreenCanvas,
    sheet: sheet as unknown as OffscreenCanvas,
  };
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
    const { piece, sheet } = await renderEvent(event, bitmaps);
    const dir = `${await storage.sessionDir(sessionId)}/out`;
    const write = async (c: OffscreenCanvas, name: string) => {
      // Lembar cetak DNP (juga diunggah sebagai aset `strip`): 0.95, detail foto DSLR tidak lembek di cetakan.
      const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.95 });
      await storage.writeFile(`${dir}/${name}`, new Uint8Array(await blob.arrayBuffer()));
      return blob;
    };
    const sheetBlob = await write(sheet, "strip.jpg");
    // 4R portrait: potong = lembar, tidak perlu file kedua.
    const same = piece === sheet;
    const pieceBlob = same ? sheetBlob : await write(piece, "piece.jpg");
    return {
      path: `${dir}/strip.jpg`,
      piecePath: `${dir}/${same ? "strip" : "piece"}.jpg`,
      url: URL.createObjectURL(pieceBlob),
    };
  } finally {
    for (const b of bitmaps) b.close();
  }
}
