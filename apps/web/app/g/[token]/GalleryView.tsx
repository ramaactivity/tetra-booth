"use client";
import { useEffect, useMemo, useState } from "react";
import { PhotoViewer } from "@/components/PhotoViewer";
import type { GalleryPhoto } from "@/lib/gallery";

type Filter = "strip" | "original" | "animation" | "favorit";
const CHIPS: [Filter, string][] = [
  ["strip", "Strip"],
  ["original", "Original"],
  ["animation", "Animasi"],
  ["favorit", "♥ Favorit"],
];
const ext = (p: GalleryPhoto) => (p.kind === "animation" ? "gif" : "jpg");
const hh = (h: number) => `${String(h).padStart(2, "0")}.00`;

/**
 * Grid seragam per jenis: seluruh foto terlihat utuh (object-contain) dalam kotak berukuran tetap,
 * satu strip utuh muat di layar tanpa scroll. `sizes` mengikuti lebar kolom agar browser memilih
 * thumb (480 px sisi panjang) di layar 1x dan `full` di layar retina.
 */
const GRID = {
  strip: {
    cols: "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8",
    sizes: "(min-width:1280px) 160px, (min-width:1024px) 16vw, (min-width:768px) 19vw, 31vw",
  },
  photo: {
    cols: "grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
    sizes: "(min-width:1280px) 260px, (min-width:1024px) 24vw, (min-width:768px) 32vw, 48vw",
  },
};
// Lebar minimum untuk srcSet (sesi lama): thumb strip 160×480, strip_web 600; thumb original 480, original 2400.
// Sesi baru (#133) 2× lebih besar; deskriptor yang terlalu kecil aman (hasilnya hanya lebih tajam).
const W = { strip: [160, 600], original: [480, 2400] } as const;

/** Unduh langsung lewat URL attachment (R2 mengirim Content-Disposition), tidak membuka tab gambar. */
function download(p: GalleryPhoto) {
  const a = document.createElement("a");
  a.href = p.download;
  a.download = `tetra-${p.sessionId}-${p.kind}.${ext(p)}`;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
}

/**
 * Isi galeri (C1–C2): toolbar lengket (filter, lompat ke jam, slideshow, ZIP), grid seragam per jam,
 * PhotoViewer dengan favorit/download/bagikan. `readOnly` = galeri publik tamu: tanpa favorit & ZIP (FSD §3).
 */
export function GalleryView({
  token,
  photos: initial,
  readOnly = false,
}: {
  token: string;
  photos: GalleryPhoto[];
  readOnly?: boolean;
}) {
  const [photos, setPhotos] = useState(initial);
  const [filter, setFilter] = useState<Filter>("strip");
  const [open, setOpen] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [scrolled, setScrolled] = useState(false);
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
  const chips = CHIPS.filter(([k]) =>
    k === "favorit" ? !readOnly : k === "strip" || photos.some((p) => p.kind === k),
  );
  const grid = filter === "original" || filter === "animation" ? GRID.photo : GRID.strip;
  // Slideshow (C1 "Putar Slideshow"): viewer maju sendiri tiap 4 dtk, berulang.
  useEffect(() => {
    if (!playing || open === null || !shown.length) return;
    const t = setTimeout(() => setOpen((open + 1) % shown.length), 4000);
    return () => clearTimeout(t);
  }, [playing, open, shown.length]);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > window.innerHeight);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  // Daftar menyusut saat viewer terbuka (mis. batal favorit di filter Favorit): pindah ke foto terakhir, atau
  // tutup lewat history.back() supaya entri history viewer ikut hilang.
  useEffect(() => {
    if (open === null || open < shown.length) return;
    if (shown.length) setOpen(shown.length - 1);
    else {
      history.back();
      setOpen(null);
      setPlaying(false);
    }
  }, [open, shown.length]);
  // Jam yang sedang terlihat → chip Jam disorot (bagian teratas yang masih tampil di bawah toolbar).
  const [activeHour, setActiveHour] = useState<number | null>(null);
  useEffect(() => {
    const els = sections
      .map(([h]) => document.getElementById(`jam-${h}`))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveHour(Number(top.target.id.slice(4)));
      },
      { rootMargin: "-140px 0px -55% 0px" },
    );
    for (const el of els) obs.observe(el);
    return () => obs.disconnect();
  }, [sections]);
  const cur = open !== null ? shown[open] : undefined;
  const act =
    "flex h-12 min-w-0 flex-1 flex-col items-center justify-center leading-tight md:flex-row md:gap-1.5";

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
      const file = new File([blob], `tetra-${p.sessionId}.${ext(p)}`, {
        type: p.kind === "animation" ? "image/gif" : "image/jpeg",
      });
      if (navigator.canShare?.({ files: [file] }))
        return void (await navigator.share({ files: [file] }));
    } catch {}
    await download(p);
  };

  const btn =
    "pressable flex h-11 flex-none items-center rounded-[10px] border-[1.5px] border-ink px-3.5 text-[13px] font-bold whitespace-nowrap no-underline";
  // Dirender dua kali (HP: di atas toolbar, tidak lengket; laptop: di dalam toolbar lengket).
  const actions = (cls: string) => (
    <div className={`items-center gap-2 ${cls}`}>
      <span className="mr-auto font-mono text-xs whitespace-nowrap text-text-2 lg:mr-1">
        {shown.length.toLocaleString("id-ID")} foto
      </span>
      {shown.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setPlaying(true);
            setOpen(0);
          }}
          className={`${btn} bg-butter font-extrabold`}
        >
          ▶ Putar Slideshow
        </button>
      )}
      {!readOnly && (filter === "strip" || filter === "original") && shown.length > 0 && (
        <a href={`/api/g/${token}/zip?kind=${filter}`} className={`${btn} bg-sky`}>
          ↓ Download Semua
        </a>
      )}
    </div>
  );

  return (
    <>
      {actions("flex lg:hidden")}
      <div className="sticky top-0 z-20 -mx-3.5 flex flex-col gap-2 border-b-[1.5px] border-dashed border-ink bg-paper px-3.5 py-2.5 md:-mx-12 md:flex-row md:items-center md:gap-4 md:px-12">
        <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:flex-none md:px-0">
          {chips.map(([k, t]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`${btn} ${filter === k ? "bg-lavender" : "bg-white"}`}
            >
              {k === "favorit" ? `${t} (${favCount})` : t}
            </button>
          ))}
        </div>
        {sections.length > 1 && (
          <nav
            aria-label="Lompat ke jam"
            className="-mx-3.5 flex items-center gap-1.5 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:min-w-0 md:flex-1 md:border-l-[1.5px] md:border-dashed md:border-ink md:pl-4"
          >
            <span className="mr-1 flex-none text-xs font-semibold text-text-2">Jam</span>
            {sections.map(([hour, idx]) => (
              <button
                key={hour}
                type="button"
                onClick={() =>
                  document
                    .getElementById(`jam-${hour}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                aria-current={activeHour === hour ? "true" : undefined}
                className={`flex h-11 flex-none items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3.5 text-[13px] font-bold ${activeHour === hour ? "bg-mint-soft" : "bg-white"}`}
              >
                {hh(hour)}
                <span className="font-mono text-[11px] font-normal text-text-2">{idx.length}</span>
              </button>
            ))}
          </nav>
        )}
        {actions("hidden lg:ml-auto lg:flex")}
      </div>

      {sections.map(([hour, idx]) => (
        <section
          key={hour}
          id={`jam-${hour}`}
          className="flex scroll-mt-32 flex-col gap-3 md:scroll-mt-20"
        >
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-extrabold tracking-[-0.02em] md:text-[22px]">{hh(hour)}</h2>
            <span className="flex-1 border-t-[1.5px] border-dashed border-ink" />
            <span className="font-mono text-xs text-text-2">{idx.length} foto</span>
          </div>
          <div className={`grid items-start gap-2 md:gap-3 ${grid.cols}`}>
            {idx.map((i) => {
              const p = shown[i];
              if (!p) return null;
              const w = p.kind === "animation" ? null : W[p.kind];
              return (
                <button
                  key={p.id}
                  type="button"
                  data-testid="gallery-photo"
                  aria-label={`Foto ${i + 1} dari ${shown.length}`}
                  onClick={() => setOpen(i)}
                  className={`relative block overflow-hidden rounded-xl border-[1.5px] border-ink bg-neutral p-1 transition-transform hover:-translate-y-0.5 motion-reduce:transition-none ${p.kind === "strip" ? "aspect-[1/3]" : "aspect-[3/2]"}`}
                >
                  <img
                    src={w ? p.thumb : p.full}
                    srcSet={w ? `${p.thumb} ${w[0]}w, ${p.full} ${w[1]}w` : undefined}
                    sizes={w ? grid.sizes : undefined}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="size-full rounded-lg object-contain"
                  />
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

      {scrolled && open === null && (
        <button
          type="button"
          aria-label="Kembali ke atas"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="pressable fixed right-4 bottom-[max(16px,env(safe-area-inset-bottom))] z-30 flex size-12 items-center justify-center rounded-full border-[1.5px] border-ink bg-white text-xl"
        >
          ↑
        </button>
      )}

      {cur && open !== null && (
        <PhotoViewer
          items={shown.map((p) => ({
            src: p.full,
            thumb: p.kind === "animation" ? p.full : p.thumb,
          }))}
          index={open}
          onIndex={setOpen}
          onClose={() => {
            setOpen(null);
            setPlaying(false);
          }}
        >
          <div className="flex overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-white text-[13px] font-bold md:mx-auto md:w-[420px]">
            {!readOnly && (
              <button
                type="button"
                onClick={() => toggleFav(cur)}
                className={`${act} border-r-[1.5px] border-ink ${cur.favorite ? "bg-coral" : ""}`}
              >
                <span>{cur.favorite ? "♥" : "♡"}</span> <span>Favorit</span>
              </button>
            )}
            <button type="button" onClick={() => download(cur)} className={act}>
              <span>↓</span> <span>Download</span>
            </button>
            <button
              type="button"
              onClick={() => share(cur)}
              className={`${act} border-l-[1.5px] border-ink`}
            >
              <span>↗</span> <span>Bagikan</span>
            </button>
          </div>
        </PhotoViewer>
      )}
    </>
  );
}
