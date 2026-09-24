import type { BoothEvent } from "./event";
import type { AssetKind, BoothStorage, SessionAsset } from "./platform";
import type { Photo, Strip } from "./session";

export const ORIGINAL_LONG_SIDE = 2400;
export const THUMB_LONG_SIDE = 480;
/** Foto untuk layar booth (preview, review, thumbnail). Raw 3000×2000 = ±24 MB tekstur GPU per foto (W-020). */
export const PREVIEW_LONG_SIDE = 1600;

/** Ukuran baru dengan sisi panjang `max`, tidak pernah memperbesar. */
export const fit = (w: number, h: number, max: number) => {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
};

const encode = async (src: ImageBitmap, w: number, h: number, sx = 0, sw = src.width) => {
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas 2d tidak tersedia");
  g.imageSmoothingQuality = "high";
  g.drawImage(src, sx, 0, sw, src.height, 0, 0, w, h);
  return new Uint8Array(
    await (await c.convertToBlob({ type: "image/jpeg", quality: 0.85 })).arrayBuffer(),
  );
};

/** Object URL JPEG kecil untuk ditampilkan; raw tetap dipakai compose & output. Rasio dijaga browser (aman untuk EXIF). */
export async function previewUrl(bytes: Uint8Array<ArrayBuffer>, w: number, h: number) {
  const bmp = await createImageBitmap(
    new Blob([bytes]),
    w >= h
      ? { resizeWidth: Math.min(w, PREVIEW_LONG_SIDE), resizeQuality: "high" }
      : { resizeHeight: Math.min(h, PREVIEW_LONG_SIDE), resizeQuality: "high" },
  );
  try {
    const jpeg = await encode(bmp, bmp.width, bmp.height);
    return URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" }));
  } finally {
    bmp.close();
  }
}

/**
 * Output upload sesi (FSD §1.9) dari strip & foto mentah, dijalankan di belakang layar setelah cetak:
 * strip_web (satu strip, bukan lembar 2x6x2 ganda), original_n (2400 px), thumb 480 px.
 * Full-res mentah tetap di raw/ dan tidak masuk daftar aset.
 */
export async function buildOutputs(
  storage: BoothStorage,
  sessionId: string,
  event: BoothEvent,
  photos: Photo[],
  strip: Strip,
): Promise<SessionAsset[]> {
  const dir = `${await storage.sessionDir(sessionId)}/out`;
  const assets: SessionAsset[] = [];
  const save = async (kind: AssetKind, idx: number, name: string, bytes: Uint8Array) => {
    const path = `${dir}/${name}`;
    await storage.writeFile(path, bytes);
    assets.push({ kind, idx, path, bytes: bytes.byteLength });
  };
  const load = async (path: string) => createImageBitmap(new Blob([await storage.readFile(path)]));

  const stripBytes = await storage.readFile(strip.path);
  assets.push({ kind: "strip", idx: 0, path: strip.path, bytes: stripBytes.byteLength });

  const sheet = await createImageBitmap(new Blob([stripBytes]));
  try {
    const single = event.layout.paper === "2x6x2" ? event.layout.canvas.width : sheet.width;
    await save(
      "strip_web",
      0,
      "strip_web.jpg",
      await encode(sheet, single, sheet.height, 0, single),
    );
    const t = fit(single, sheet.height, THUMB_LONG_SIDE);
    await save(
      "thumb_strip",
      0,
      "thumb_strip.jpg",
      await encode(sheet, t.width, t.height, 0, single),
    );
  } finally {
    sheet.close();
  }

  for (const [i, p] of photos.entries()) {
    const raw = await load(p.path);
    try {
      const o = fit(raw.width, raw.height, ORIGINAL_LONG_SIDE);
      await save("original", i + 1, `original_${i + 1}.jpg`, await encode(raw, o.width, o.height));
      const t = fit(raw.width, raw.height, THUMB_LONG_SIDE);
      await save(
        "thumb_original",
        i + 1,
        `thumb_original_${i + 1}.jpg`,
        await encode(raw, t.width, t.height),
      );
    } finally {
      raw.close();
    }
  }
  return assets;
}
