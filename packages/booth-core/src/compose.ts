import type { LayoutSpec } from "@tetra/shared";
import { browserContext, cpuCanvas, renderPiece, toSheet } from "@tetra/template-engine";
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

/** Foto abu-abu seukuran slot (test print, pratinjau desain); `label` = teks "LABEL n" di tiap foto. */
export function placeholderPhotos(layout: LayoutSpec, label?: string): OffscreenCanvas[] {
  return layout.slots.map((s, i) => {
    const c = cpuCanvas(Math.round(s.w), Math.round(s.h));
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = i % 2 ? "#b8b2aa" : "#8a847d";
      g.fillRect(0, 0, c.width, c.height);
      if (label) {
        g.fillStyle = "#ffffff";
        g.font = `${Math.round(c.height / 5)}px sans-serif`;
        g.fillText(`${label} ${i + 1}`, c.width * 0.08, c.height * 0.6);
      }
    }
    return c;
  });
}

/** Pratinjau satu desain (DECISIONS #99) lewat template engine yang sama → object URL JPEG kecil. */
export async function designPreview(event: BoothEvent, layout: LayoutSpec): Promise<string> {
  const { piece } = await renderEvent({ ...event, layout }, placeholderPhotos(layout));
  const blob = await piece.convertToBlob({ type: "image/jpeg", quality: 0.8 });
  return URL.createObjectURL(blob);
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
