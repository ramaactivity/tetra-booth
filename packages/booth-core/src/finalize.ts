/// <reference path="./gifenc.d.ts" />
import { cpuCanvas } from "@tetra/template-engine";
import { applyPalette, GIFEncoder, quantize } from "gifenc";
import type { AssetKind, BoothStorage, SessionAsset } from "./platform";
import type { Photo, Strip } from "./session";
import { sharpness } from "./sharpness";

export const ORIGINAL_LONG_SIDE = 2400;
export const THUMB_LONG_SIDE = 480;
/** GIF animasi foto sesi (DECISIONS #62): sisi panjang & jeda antar-frame. */
export const ANIMATION_LONG_SIDE = 720;
export const ANIMATION_FRAME_MS = 500;
/** Foto untuk layar booth (preview, review, thumbnail). Raw 3000×2000 = ±24 MB tekstur GPU per foto (W-020). */
export const PREVIEW_LONG_SIDE = 1600;

/** Ukuran baru dengan sisi panjang `max`, tidak pernah memperbesar. */
export const fit = (w: number, h: number, max: number) => {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.round(w * k), height: Math.round(h * k) };
};

/**
 * Kualitas JPEG: thumb 0.85 (kecil, daftar), foto yang dilihat/diunduh tamu 0.92. 0.85 membuat foto DSLR
 * ISO tinggi tampak lembek di HP (W-031, masukan Rama); 0.92 menaikkan ukuran ±60–70%, tetap < 1 MB per foto.
 */
const THUMB_QUALITY = 0.85;
const VIEW_QUALITY = 0.92;

const encode = async (src: ImageBitmap, w: number, h: number, quality = THUMB_QUALITY) => {
  const c = cpuCanvas(w, h);
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas 2d tidak tersedia");
  g.imageSmoothingQuality = "high";
  g.drawImage(src, 0, 0, w, h);
  return new Uint8Array(
    await (await c.convertToBlob({ type: "image/jpeg", quality })).arrayBuffer(),
  );
};

/** Object URL JPEG kecil untuk ditampilkan + skor ketajaman (#88); raw tetap dipakai compose & output. Rasio dijaga browser (aman untuk EXIF). */
export async function previewUrl(bytes: Uint8Array<ArrayBuffer>, w: number, h: number) {
  const bmp = await createImageBitmap(
    new Blob([bytes]),
    w >= h
      ? { resizeWidth: Math.min(w, PREVIEW_LONG_SIDE), resizeQuality: "high" }
      : { resizeHeight: Math.min(h, PREVIEW_LONG_SIDE), resizeQuality: "high" },
  );
  try {
    const sharp = sharpness(bmp);
    const jpeg = await encode(bmp, bmp.width, bmp.height);
    return { url: URL.createObjectURL(new Blob([jpeg], { type: "image/jpeg" })), sharp };
  } finally {
    bmp.close();
  }
}

/**
 * Output upload sesi (FSD §1.9) dari strip & foto mentah, dijalankan di belakang layar setelah cetak:
 * strip_web (satu potong desain, bukan lembar cetak), original_n (2400 px), thumb 480 px,
 * animation (GIF berulang dari foto sesi, ≥ 2 foto).
 * Full-res mentah tetap di raw/ dan tidak masuk daftar aset.
 */
export async function buildOutputs(
  storage: BoothStorage,
  sessionId: string,
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

  // strip_web & thumb = satu potong desain dalam orientasi aslinya, bukan lembar cetak.
  const piece = await load(strip.piecePath);
  try {
    await save(
      "strip_web",
      0,
      "strip_web.jpg",
      await encode(piece, piece.width, piece.height, VIEW_QUALITY),
    );
    const t = fit(piece.width, piece.height, THUMB_LONG_SIDE);
    await save("thumb_strip", 0, "thumb_strip.jpg", await encode(piece, t.width, t.height));
  } finally {
    piece.close();
  }

  const frames: ImageData[] = [];
  for (const [i, p] of photos.entries()) {
    const raw = await load(p.path);
    try {
      const a = fit(raw.width, raw.height, ANIMATION_LONG_SIDE);
      const c = cpuCanvas(a.width, a.height);
      const g = c.getContext("2d");
      if (g) {
        g.imageSmoothingQuality = "high";
        g.drawImage(raw, 0, 0, a.width, a.height);
        frames.push(g.getImageData(0, 0, a.width, a.height));
      }
      const o = fit(raw.width, raw.height, ORIGINAL_LONG_SIDE);
      await save(
        "original",
        i + 1,
        `original_${i + 1}.jpg`,
        await encode(raw, o.width, o.height, VIEW_QUALITY),
      );
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
  if (frames.length > 1) {
    const gif = GIFEncoder();
    for (const f of frames) {
      const palette = quantize(f.data, 256);
      gif.writeFrame(applyPalette(f.data, palette), f.width, f.height, {
        palette,
        delay: ANIMATION_FRAME_MS,
      });
    }
    gif.finish();
    await save("animation", 0, "animation.gif", gif.bytes());
  }
  // Video hitung mundur (#117), ditulis SessionRunner saat masuk compose (kalau event menyalakannya).
  const video = await storage.readFile(`${dir}/video.mp4`).catch(() => null);
  if (video?.byteLength)
    assets.push({ kind: "video", idx: 0, path: `${dir}/video.mp4`, bytes: video.byteLength });
  return assets;
}
