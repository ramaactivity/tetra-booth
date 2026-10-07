import { filterCss, type LayoutSpec } from "@tetra/shared";
import { cpuCanvas, type ImageLike, type RenderContext } from "@tetra/template-engine";
import { renderEvent, renderWebPiece } from "./compose";
import { type BoothEvent, loadEvent, releaseEvent } from "./event";
import { encodeWebPiece } from "./finalize";
import type { BoothPlatform } from "./platform";

/**
 * "Tajamkan foto lama" (DECISIONS #140): render ulang strip_web 2× (#133) untuk sesi lama.
 * Cloud tidak menyimpan desain (#99) & filter (#116) sesi, dan desain event bisa sudah diedit, jadi tiap kombinasi
 * desain × filter dirender 1× lewat renderEvent dan dibandingkan dengan potongan 1× yang tersimpan di booth.
 */
export const MATCH_WIDTH = 150;
export const MATCH_TILE = 10;
/**
 * Batas beda ubin terburuk (0–255). Diukur di test/rerender.test.ts (fixture warna rata bertepi tajam = kasus JPEG
 * terburuk): JPEG 0.95/0.85/0.70 = 1,8/1,7/2,9; filter Hangat 11, Pudar/Vintage 17, Hitam Putih 55; teks lain 39,
 * warna latar lain 17, slot bergeser 80. Electron (e2e, foto kamera simulasi): kombinasi benar 0,6, Hangat vs
 * Normal 8, Hitam Putih 37. 4 = di atas noise JPEG 0.95, separuh beda filter paling halus.
 */
export const MATCH_MAX = 4;

type Thumb = { w: number; h: number; data: ArrayLike<number> };

/** Gambar diperkecil ke lebar 150 px (RGBA). */
export function matchThumb(img: ImageLike, create: RenderContext["createCanvas"]): Thumb {
  const w = MATCH_WIDTH;
  const h = Math.max(1, Math.round((img.height * w) / img.width));
  const g = create(w, h).getContext("2d");
  if (!g) throw new Error("canvas 2d tidak tersedia");
  g.imageSmoothingQuality = "high";
  g.drawImage(img, 0, 0, w, h);
  return { w, h, data: g.getImageData(0, 0, w, h).data };
}

/**
 * Beda dua thumbnail: rata-rata beda absolut RGB per ubin 10×10, diambil ubin terburuk (perubahan kecil seperti
 * teks tidak tenggelam dalam rata-rata seluruh gambar). Ukuran beda = Infinity.
 */
export function thumbDiff(a: Thumb, b: Thumb): number {
  if (a.w !== b.w || a.h !== b.h) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (let ty = 0; ty < a.h; ty += MATCH_TILE)
    for (let tx = 0; tx < a.w; tx += MATCH_TILE) {
      let sum = 0;
      let n = 0;
      for (let y = ty; y < Math.min(ty + MATCH_TILE, a.h); y++)
        for (let x = tx; x < Math.min(tx + MATCH_TILE, a.w); x++) {
          const i = (y * a.w + x) * 4;
          for (let c = 0; c < 3; c++) sum += Math.abs((a.data[i + c] ?? 0) - (b.data[i + c] ?? 0));
          n += 3;
        }
      worst = Math.max(worst, sum / n);
    }
  return worst;
}

export type SharpenProgress = {
  total: number;
  done: number;
  updated: number;
  /** Tidak ada desain × filter yang cocok (desain berubah). */
  mismatch: number;
  /** Foto raw / potongan / bundle event tidak ada, atau gagal render. */
  skipped: number;
};

const decode = async (p: BoothPlatform, path: string) =>
  createImageBitmap(new Blob([await p.storage.readFile(path)]));

/** Semua desain event (utama, pilihan tamu #99, photobox) tanpa duplikat. */
const eventLayouts = (ev: BoothEvent): LayoutSpec[] => {
  const all = [
    ev.layout,
    ...(ev.designs ?? []).map((d) => d.layout),
    ...(ev.photobox?.layouts ?? []).map((l) => l.layout),
  ];
  return all.filter((l, i) => all.findIndex((x) => x.id === l.id) === i);
};

/** Satu sesi → hasilnya. */
async function sharpenOne(
  p: BoothPlatform,
  ev: BoothEvent,
  s: { id: string; photos: string[]; piece: string },
  qrUrl: string,
): Promise<"updated" | "mismatch" | "skipped"> {
  const stored = await decode(p, s.piece);
  const bitmaps: ImageBitmap[] = [];
  try {
    for (const path of s.photos) bitmaps.push(await decode(p, path));
    const target = matchThumb(stored, cpuCanvas);
    let best: { layout: LayoutSpec; filter: string; score: number } | null = null;
    const layouts = eventLayouts(ev).filter(
      (l) =>
        l.slots.length === bitmaps.length &&
        l.canvas.width === stored.width &&
        l.canvas.height === stored.height,
    );
    const filters = ["none", ...ev.settings.filters.map(filterCss)];
    for (const layout of layouts)
      for (const filter of filters) {
        const { piece } = await renderEvent({ ...ev, layout }, bitmaps, filter, qrUrl);
        const score = thumbDiff(matchThumb(piece, cpuCanvas), target);
        if (!best || score < best.score) best = { layout, filter, score };
      }
    console.info(
      `[sharpen] ${s.id}: ${layouts.length}×${filters.length} kandidat, beda terkecil ${best?.score.toFixed(1) ?? "-"}`,
    );
    if (!best || best.score > MATCH_MAX) return "mismatch";
    const web = await renderWebPiece(
      p.storage,
      s.id,
      { ...ev, layout: best.layout },
      s.photos.map((path) => ({ path })),
      best.filter,
      qrUrl,
    );
    if (!web) return "skipped";
    const dir = `${await p.storage.sessionDir(s.id)}/out`;
    await p.crew.reupload(s.id, await encodeWebPiece(p.storage, dir, web));
    return "updated";
  } finally {
    stored.close();
    for (const b of bitmaps) b.close();
  }
}

/** Jalankan untuk semua sesi lama booth ini; berhenti di antara sesi saat `signal` dibatalkan. */
export async function sharpenOldSessions(
  p: BoothPlatform,
  guestBaseUrl: string,
  onProgress: (x: SharpenProgress) => void,
  signal: AbortSignal,
): Promise<SharpenProgress> {
  const list = await p.crew.oldSessions();
  const bundles = new Map((await p.events.list()).map((b) => [b.id, b]));
  const x: SharpenProgress = { total: list.length, done: 0, updated: 0, mismatch: 0, skipped: 0 };
  onProgress({ ...x });
  // Daftar urut event: cukup satu event termuat sekaligus.
  let ev: BoothEvent | null = null;
  const release = () => {
    if (!ev) return;
    releaseEvent(ev);
    for (const b of Object.values(ev.render?.images ?? {})) b.close();
    ev = null;
  };
  try {
    for (const s of list) {
      if (signal.aborted) break;
      let r: "updated" | "mismatch" | "skipped" = "skipped";
      try {
        const bundle = bundles.get(s.eventId);
        if (bundle && s.piece && s.photos.length) {
          if (ev?.id !== bundle.id) {
            release();
            ev = await loadEvent(bundle, p.events);
          }
          r = await sharpenOne(p, ev, { ...s, piece: s.piece }, `${guestBaseUrl}/s/${s.id}`);
        }
      } catch (e) {
        console.warn(`[sharpen] ${s.id} gagal: ${e instanceof Error ? e.message : String(e)}`);
      }
      x[r]++;
      x.done++;
      onProgress({ ...x });
      console.info(`[sharpen] ${s.id}: ${r}`);
    }
  } finally {
    release();
  }
  return x;
}
