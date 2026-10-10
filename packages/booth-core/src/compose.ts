import type { LayoutSpec } from "@tetra/shared";
import { browserContext, cpuCanvas, renderPiece, toSheet, withQr } from "@tetra/template-engine";
import type { BoothEvent } from "./event";
import type { BoothStorage } from "./platform";
import { toneForPrint } from "./printTone";
import type { Photo, Strip } from "./session";

const FONT = "Geist Variable";
/** Skala potongan web (strip_web & pratinjau layar) terhadap kanvas desain. */
const WEB_SCALE = 2;

/**
 * Render layout event (aset & font bundle ikut) dengan foto apa pun; dipakai compose dan test print.
 * `piece` = satu potong desain (layar & web), `sheet` = lembar cetak 1200×1800 (DECISIONS #78).
 */
/** Jumlah jepretan per sesi (#207): slot desain, ×2 untuk polaroid/2R "dua sisi berbeda". */
export const shotsPerSession = (
  layout: BoothEvent["layout"],
  settings: Pick<BoothEvent["settings"], "pairDifferent">,
) => layout.slots.length * (settings.pairDifferent && layout.paper !== "4R" ? 2 : 1);

export async function renderEvent(
  event: BoothEvent,
  photos: ImageBitmap[] | OffscreenCanvas[],
  /** CSS filter pilihan tamu (#116). */
  photoFilter = "none",
  /** Link halaman tamu sesi untuk elemen QR di desain; kosong = URL contoh (tes cetak, pratinjau). */
  qrUrl?: string,
  /** Skala versi web (`web`); 1 = sama dengan potongan cetak. */
  webScale = 1,
): Promise<{
  piece: OffscreenCanvas;
  sheet: OffscreenCanvas;
  web: OffscreenCanvas;
  /** Dua sisi lembar beda foto (#207): layar menampilkan lembar utuh, bukan satu potong. */
  pair: boolean;
}> {
  // QR first (#247): desain tanpa elemen QR tetap tercetak dengan QR halaman tamu, menimpa QR contoh di desain
  // (Rafi & Dinda: QR ke tetraphoto.com tertanam di PNG) atau di pojok kosong.
  const ovId = event.layout.overlay?.assetId;
  event = {
    ...event,
    layout: withQr(event.layout, ovId ? event.render?.images?.[ovId] : undefined, browserContext()),
  };
  const fonts = event.render?.fonts ?? {};
  if (event.layout.texts.some((t) => !fonts[t.fontAssetId]))
    await document.fonts.load(`40px "${FONT}"`);
  const ctx = { ...browserContext(FONT), fontFamily: (id: string) => fonts[id] ?? FONT };
  const inputs = {
    photos,
    assets: event.render?.images ?? {},
    vars: { event_name: event.name, date: event.date },
    photoFilter,
    qrUrl,
  };
  // Polaroid/2R dua sisi berbeda (#207): foto 1..n = potong kiri/atas, n+1..2n = potong kanan/bawah.
  const n = event.layout.slots.length;
  const pair = shotsPerSession(event.layout, event.settings) > n && photos.length >= 2 * n;
  const first = pair ? { ...inputs, photos: photos.slice(0, n) as typeof photos } : inputs;
  const piece = renderPiece(event.layout, first, ctx);
  const second = pair
    ? renderPiece(event.layout, { ...inputs, photos: photos.slice(n, 2 * n) as typeof photos }, ctx)
    : undefined;
  const sheet = toSheet(event.layout, piece, ctx, second);
  // Dua sisi beda (#207): halaman tamu/galeri dulu hanya menampilkan potong pertama; kini lembar utuh berisi kedua
  // sisi, sama dengan cetakan (#250).
  const web = pair
    ? sheet
    : webScale === 1
      ? piece
      : renderPiece(event.layout, first, ctx, webScale);
  return {
    piece: piece as unknown as OffscreenCanvas,
    sheet: sheet as unknown as OffscreenCanvas,
    web: web as unknown as OffscreenCanvas,
    pair,
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
  photoFilter = "none",
  qrUrl?: string,
): Promise<Strip> {
  const bitmaps = await Promise.all(
    photos.map(async (p) => createImageBitmap(new Blob([await storage.readFile(p.path)]))),
  );
  try {
    const { piece, sheet, pair } = await renderEvent(event, bitmaps, photoFilter, qrUrl);
    const dir = `${await storage.sessionDir(sessionId)}/out`;
    const write = async (c: OffscreenCanvas, name: string) => {
      // Lembar cetak DNP (juga diunggah sebagai aset `strip`): 0.95, detail foto DSLR tidak lembek di cetakan.
      const blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.95 });
      await storage.writeFile(`${dir}/${name}`, new Uint8Array(await blob.arrayBuffer()));
      return blob;
    };
    // Koreksi warna printer (#208) hanya untuk lembar cetak; potong web tetap warna layar.
    const printSheet = toneForPrint(sheet);
    const sheetBlob = await write(printSheet, "strip.jpg");
    // Dua sisi beda (#207): galeri crew, thumbnail & strip_web memakai lembar utuh, bukan potong pertama (#250).
    const web = pair ? sheet : piece;
    // 4R portrait: potong = lembar, tidak perlu file kedua (kecuali lembar cetak dikoreksi warnanya).
    const same = web === sheet && printSheet === sheet;
    const pieceBlob = same ? sheetBlob : await write(web, "piece.jpg");
    return {
      path: `${dir}/strip.jpg`,
      piecePath: `${dir}/${same ? "strip" : "piece"}.jpg`,
      url: URL.createObjectURL(
        pair ? await sheet.convertToBlob({ type: "image/jpeg", quality: 0.9 }) : pieceBlob,
      ),
    };
  } finally {
    for (const b of bitmaps) b.close();
  }
}

/**
 * Potongan web 2× (strip_web & thumbnail HP/galeri, #133) di latar belakang SETELAH tamu melihat hasilnya:
 * potongan 2R cuma 600 px lebar, buram di layar rapat. Menulis out/piece@2x.jpg; null = gagal (pakai potongan 1×).
 */
export async function renderWebPiece(
  storage: BoothStorage,
  sessionId: string,
  event: BoothEvent,
  photos: Pick<Photo, "path">[],
  photoFilter = "none",
  qrUrl?: string,
): Promise<string | null> {
  const bitmaps = await Promise.all(
    photos.map(async (p) => createImageBitmap(new Blob([await storage.readFile(p.path)]))),
  );
  try {
    const { web } = await renderEvent(event, bitmaps, photoFilter, qrUrl, WEB_SCALE);
    const blob = await web.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    const path = `${await storage.sessionDir(sessionId)}/out/piece@2x.jpg`;
    await storage.writeFile(path, new Uint8Array(await blob.arrayBuffer()));
    return path;
  } catch {
    return null;
  } finally {
    for (const b of bitmaps) b.close();
  }
}
