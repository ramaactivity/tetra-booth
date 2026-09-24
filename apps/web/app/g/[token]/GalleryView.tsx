"use client";
import { useEffect, useMemo, useState } from "react";
import type { GalleryPhoto } from "@/lib/gallery";

type Filter = "strip" | "original" | "favorit";
const CHIPS: [Filter, string][] = [
  ["strip", "Strip"],
  ["original", "Original"],
  ["favorit", "♥ Favorit"],
];

async function download(p: GalleryPhoto) {
  try {
    const blob = await (await fetch(p.full)).blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tetra-${p.sessionId}-${p.kind}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch {
    window.open(p.full, "_blank");
  }
}

/** Isi galeri (C1–C2): filter, bagian per jam, masonry, lightbox dengan favorit/download/bagikan. */
export function GalleryView({ token, photos: initial }: { token: string; photos: GalleryPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  const [filter, setFilter] = useState<Filter>("strip");
  const [open, setOpen] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const shown = useMemo(
    () => photos.filter((p) => (filter === "favorit" ? p.favorite : p.kind === filter)),
    [photos, filter],
  );
  const sections = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const [i, p] of shown.entries()) m.set(p.hour, [...(m.get(p.hour) ?? []), i]);
    return [...m.entries()];
  }, [shown]);
  const favCount = photos.filter((p) => p.favorite).length;
  // Slideshow (C1 "Putar Slideshow"): lightbox maju sendiri tiap 4 dtk, berulang.
  useEffect(() => {
    if (!playing || open === null) return;
    const t = setTimeout(() => setOpen((open + 1) % shown.length), 4000);
    return () => clearTimeout(t);
  }, [playing, open, shown.length]);
  const cur = open !== null ? shown[open] : undefined;

  const toggleFav = async (p: GalleryPhoto) => {
    const res = await fetch(`/api/g/${token}/favorites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId: p.id }),
    });
    if (!res.ok) return;
    const { favorite } = (await res.json()) as { favorite: boolean };
    setPhotos((all) => all.map((x) => (x.id === p.id ? { ...x, favorite } : x)));
  };
  const share = async (p: GalleryPhoto) => {
    try {
      const blob = await (await fetch(p.full)).blob();
      const file = new File([blob], `tetra-${p.sessionId}.jpg`, { type: "image/jpeg" });
      if (navigator.canShare?.({ files: [file] }))
        return void (await navigator.share({ files: [file] }));
    } catch {}
    await download(p);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {CHIPS.map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`h-9 rounded-[10px] border-[1.5px] border-ink px-3.5 text-[13px] font-bold ${filter === k ? "bg-lavender" : "bg-white"}`}
          >
            {k === "favorit" ? `${t} (${favCount})` : t}
          </button>
        ))}
        {shown.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setPlaying(true);
              setOpen(0);
            }}
            className="ml-auto h-9 rounded-[10px] border-[1.5px] border-ink bg-butter px-4 text-[13px] font-extrabold"
          >
            ▶ Putar Slideshow
          </button>
        )}
        {filter !== "favorit" && shown.length > 0 && (
          <a
            href={`/api/g/${token}/zip?kind=${filter}`}
            className="flex h-9 items-center rounded-[10px] border-[1.5px] border-ink bg-sky px-3.5 text-[13px] font-bold no-underline"
          >
            ↓ Download Semua
          </a>
        )}
      </div>

      {sections.map(([hour, idx]) => (
        <section key={hour} className="flex flex-col gap-3">
          <div className="flex items-center gap-3.5">
            <h2 className="text-lg font-extrabold tracking-[-0.02em] md:text-[26px]">
              {String(hour).padStart(2, "0")}.00
            </h2>
            <span className="flex-1 border-t-[1.5px] border-dashed border-ink" />
            <span className="font-mono text-xs text-text-2">{idx.length} foto</span>
          </div>
          <div className="columns-2 gap-2 md:columns-4 md:gap-3">
            {idx.map((i) => {
              const p = shown[i];
              if (!p) return null;
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid="gallery-photo"
                  onClick={() => setOpen(i)}
                  className="relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl border-[1.5px] border-ink bg-neutral md:mb-3"
                >
                  <img src={p.thumb} alt="" loading="lazy" className="block w-full" />
                  {p.favorite && (
                    <span className="absolute top-1.5 right-1.5 rounded-full border-[1.5px] border-ink bg-coral px-1.5 text-xs">
                      ♥
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      ))}
      {!shown.length && (
        <p className="py-10 text-center text-sm text-text-2">Belum ada foto di sini.</p>
      )}

      {cur && open !== null && (
        <div role="dialog" aria-label="Foto" className="fixed inset-0 z-50 flex flex-col bg-paper">
          <div className="flex items-center justify-between px-4 py-3.5">
            <button
              type="button"
              aria-label="Tutup"
              onClick={() => {
                setOpen(null);
                setPlaying(false);
              }}
              className="flex size-10 items-center justify-center rounded-xl border-[1.5px] border-ink bg-white"
            >
              ✕
            </button>
            <div className="text-center">
              <div className="font-mono text-[13px] font-medium">
                {open + 1} / {shown.length}
              </div>
              <div className="text-xs text-text-2">{String(cur.hour).padStart(2, "0")}.00</div>
            </div>
            <span className="size-10" />
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center px-4">
            <img
              src={cur.full}
              alt=""
              className="max-h-full max-w-full rounded-lg border-[1.5px] border-ink object-contain"
            />
            {open > 0 && (
              <button
                type="button"
                aria-label="Sebelumnya"
                onClick={() => setOpen(open - 1)}
                className="absolute top-1/2 left-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-ink bg-white"
              >
                ‹
              </button>
            )}
            {open < shown.length - 1 && (
              <button
                type="button"
                aria-label="Berikutnya"
                onClick={() => setOpen(open + 1)}
                className="absolute top-1/2 right-3 flex size-11 -translate-y-1/2 items-center justify-center rounded-full border-[1.5px] border-ink bg-white"
              >
                ›
              </button>
            )}
          </div>
          <div className="mx-4 my-4 flex overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-white text-sm font-bold md:mx-auto md:w-[420px]">
            <button
              type="button"
              onClick={() => toggleFav(cur)}
              className={`h-12 flex-1 ${cur.favorite ? "bg-coral" : ""}`}
            >
              {cur.favorite ? "♥ Favorit" : "♡ Favorit"}
            </button>
            <button
              type="button"
              onClick={() => download(cur)}
              className="h-12 flex-1 border-l-[1.5px] border-ink"
            >
              ↓ Download
            </button>
            <button
              type="button"
              onClick={() => share(cur)}
              className="h-12 flex-1 border-l-[1.5px] border-ink"
            >
              ↗ Bagikan
            </button>
          </div>
        </div>
      )}
    </>
  );
}
