"use client";
import type { LayoutSpec } from "@tetra/shared";
import { browserContext, cpuCanvas, type ImageLike, renderPiece } from "@tetra/template-engine";
import { useEffect, useRef, useState } from "react";

const GEIST = "Geist Variable";
/** Sisi terpanjang gambar pratinjau (px): cukup tajam untuk kartu besar, ringan untuk puluhan kartu. */
const MAX_SIDE = 900;

export type PreviewVars = { event_name: string; date: string };
/** Template editor: aset (overlay, latar, font) diambil lewat route aset editor untuk versi ini. */
export type PreviewTemplate = { id: string; version: number; files: Record<string, string> };

const fonts = new Map<string, Promise<string>>();
const images = new Map<string, Promise<ImageLike | null>>();

const loadFont = (family: string, url: string) => {
  let p = fonts.get(family);
  if (!p) {
    p = new FontFace(family, `url(${url})`).load().then(
      (f) => {
        document.fonts.add(f);
        return family;
      },
      () => GEIST,
    );
    fonts.set(family, p);
  }
  return p;
};

const loadImage = (url: string) => {
  let p = images.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then(createImageBitmap)
      .catch(() => null);
    images.set(url, p);
  }
  return p;
};

/** Foto contoh abu-abu seukuran slot (seperti pratinjau Pilih desain di booth). */
const photo = (w: number, h: number, i: number) => {
  const c = cpuCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const g = c.getContext("2d");
  if (g) {
    g.fillStyle = i % 2 ? "#c9c5bd" : "#a9a49c";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(255,255,255,.7)";
    g.font = `800 ${Math.round(Math.min(c.width, c.height) / 4)}px "Plus Jakarta Sans Variable"`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(String(i + 1), c.width / 2, c.height / 2);
  }
  return c;
};

/** Render lewat template engine yang sama dengan booth (aturan 2) → object URL JPEG kecil. */
async function draw(
  layout: LayoutSpec,
  t: PreviewTemplate | undefined,
  vars: PreviewVars,
): Promise<string> {
  const asset = (id: string) =>
    t && id in t.files ? `/admin/templates/${t.id}/asset/${id}?v=${t.version}` : null;
  await document.fonts.load(`40px "${GEIST}"`);
  const family: Record<string, string> = {};
  for (const { fontAssetId: id } of layout.texts) {
    const url = asset(id);
    if (id.startsWith("lib-"))
      family[id] = await loadFont(`tb-${id}`, `/fonts/${id.slice(4)}.woff2`);
    else if (t && url) family[id] = await loadFont(`tpl-${t.id}-${id}-${t.version}`, url);
  }
  const assets: Record<string, ImageLike> = {};
  for (const id of [layout.overlay?.assetId, layout.background?.assetId]) {
    const url = id && asset(id);
    const img = url ? await loadImage(url) : null;
    if (id && img) assets[id] = img;
  }
  const piece = renderPiece(
    layout,
    { photos: layout.slots.map((s, i) => photo(s.w, s.h, i)), assets, vars },
    { ...browserContext(GEIST), fontFamily: (id) => family[id] ?? GEIST },
  ) as unknown as OffscreenCanvas;
  const k = Math.min(1, MAX_SIDE / Math.max(piece.width, piece.height));
  const out = cpuCanvas(Math.round(piece.width * k), Math.round(piece.height * k));
  out.getContext("2d")?.drawImage(piece, 0, 0, out.width, out.height);
  return URL.createObjectURL(await out.convertToBlob({ type: "image/jpeg", quality: 0.85 }));
}

/** Satu render per waktu: puluhan kartu tidak membekukan halaman bersamaan. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * Pratinjau asli satu desain (template engine, foto contoh, nama & tanggal event). Selama render tampil
 * kotak bergaris serasio kanvas. Mengisi kotak induk (tinggi pasti) tanpa melewati lebar/tingginya.
 */
export function DesignPreview({
  layout,
  template,
  vars,
  alt,
  className = "",
}: {
  layout: LayoutSpec;
  template?: PreviewTemplate | undefined;
  vars: PreviewVars;
  alt: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const latest = useRef({ layout, template, vars });
  latest.current = { layout, template, vars };
  const key = JSON.stringify([layout, template?.id, template?.version, vars]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` = isi layout & vars; nilai terbaru dibaca dari ref
  useEffect(() => {
    let alive = true;
    // Jeda singkat: mengetik nama event tidak memicu render tiap huruf.
    const timer = setTimeout(() => {
      const { layout: l, template: t, vars: v } = latest.current;
      const job = queue.then(() => (alive ? draw(l, t, v) : null));
      queue = job.catch(() => {});
      job
        .then((u) => {
          if (!u) return;
          if (!alive) return URL.revokeObjectURL(u);
          setUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return u;
          });
        })
        .catch(() => {});
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [key]);
  useEffect(
    () => () => {
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    },
    [],
  );

  const ratio = `${layout.canvas.width} / ${layout.canvas.height}`;
  return url ? (
    // biome-ignore lint/performance/noImgElement: object URL hasil render lokal, bukan aset untuk dioptimasi
    <img
      src={url}
      alt={alt}
      className={`block max-h-full max-w-full border-[1.5px] border-ink bg-white ${className}`}
    />
  ) : (
    <span
      {...(alt
        ? { role: "img", "aria-label": `${alt} (memuat pratinjau)` }
        : { "aria-hidden": true })}
      style={{ aspectRatio: ratio }}
      className={`stripes block h-full max-w-full border-[1.5px] border-dashed border-ink ${className}`}
    />
  );
}
