"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GalleryPhoto } from "@/lib/gallery";

const mmss = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/**
 * Tab Guest Cam galeri klien (desain D13a/c, #203): satu baris per tamu (nama, jumlah foto/strip/ucapan, Unduh),
 * foto digeser ke samping, strip lebih dulu. `shown` = urutan viewer; klik membuka PhotoViewer di indeks itu.
 */
export function GuestRows({
  shown,
  all,
  token,
  readOnly,
  onOpen,
}: {
  shown: GalleryPhoto[];
  all: GalleryPhoto[];
  token: string;
  readOnly: boolean;
  onOpen: (i: number) => void;
}) {
  const guests = useMemo(() => {
    const m = new Map<string, { name: string; idx: number[] }>();
    for (const [i, p] of shown.entries()) {
      const g = m.get(p.sessionId) ?? { name: p.group ?? "Tamu", idx: [] };
      g.idx.push(i);
      m.set(p.sessionId, g);
    }
    for (const g of m.values())
      g.idx.sort((a, b) => Number(shown[b]?.kind === "strip") - Number(shown[a]?.kind === "strip"));
    return [...m.entries()];
  }, [shown]);
  const voices = useMemo(
    () => new Set(all.filter((p) => p.kind === "audio").map((p) => p.sessionId)),
    [all],
  );
  return (
    <div className="flex flex-col">
      <p className="border-b-[1.5px] border-dashed border-ink pb-3 text-[15px]">
        <b>{guests.length.toLocaleString("id-ID")} tamu</b> ikut memotret
      </p>
      {guests.map(([sid, g]) => {
        const strips = g.idx.filter((i) => shown[i]?.kind === "strip").length;
        const photos = g.idx.length - strips;
        return (
          <section
            key={sid}
            className="flex flex-col gap-3 border-b-[1.5px] border-dashed border-ink py-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold tracking-[-0.02em]">{g.name}</h2>
                <p className="font-mono text-xs text-text-2">
                  {[
                    `${photos} foto`,
                    strips ? `${strips} strip` : null,
                    voices.has(sid) ? "1 ucapan" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {!readOnly && (
                <a
                  href={`/api/g/${token}/zip?kind=guest&session=${sid}`}
                  className="flex h-10 flex-none items-center rounded-[10px] border-[1.5px] border-ink bg-white px-3.5 text-[13px] font-bold no-underline"
                >
                  Unduh
                </a>
              )}
            </div>
            <div className="-mx-3.5 flex gap-2.5 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
              {g.idx.map((i) => {
                const p = shown[i];
                if (!p) return null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid="gallery-photo"
                    onClick={() => onOpen(i)}
                    aria-label={`${g.name} · foto ${i + 1}`}
                    className={`relative h-[200px] flex-none overflow-hidden rounded-xl border-[1.5px] border-ink bg-neutral md:h-[180px] ${p.kind === "strip" ? "aspect-[1/3] bg-white p-1" : "aspect-[3/4]"}`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
                    <img
                      src={p.thumb}
                      alt=""
                      loading="lazy"
                      className={`size-full ${p.kind === "strip" ? "object-contain" : "object-cover"}`}
                    />
                    {p.kind === "strip" && (
                      <span className="absolute bottom-1.5 left-1.5 rounded-full border-[1.5px] border-ink bg-butter px-2 text-[11px] font-extrabold">
                        Strip
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** Tab Ucapan (desain D13b): kartu ringkas + Putar semua berurutan, daftar pemutar per tamu. */
export function VoiceList({
  items,
  onDownload,
}: {
  items: GalleryPhoto[];
  onDownload: (p: GalleryPhoto) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null);
  const [cur, setCur] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [all, setAll] = useState(false);
  const [pos, setPos] = useState(0);
  const [dur, setDur] = useState<Record<string, number>>({});

  // Durasi dari metadata (webm MediaRecorder sering tanpa durasi → dilewati sampai diputar).
  useEffect(() => {
    for (const p of items) {
      const a = new Audio();
      a.preload = "metadata";
      a.src = p.full;
      a.onloadedmetadata = () => {
        if (Number.isFinite(a.duration)) setDur((d) => ({ ...d, [p.id]: a.duration }));
      };
    }
  }, [items]);

  const play = (i: number) => {
    const a = audio.current;
    const p = items[i];
    if (!a || !p) return;
    if (cur === i && !a.paused) {
      a.pause();
      setPlaying(false);
      return;
    }
    if (cur !== i) {
      a.src = p.full;
      setCur(i);
      setPos(0);
    }
    void a.play().then(() => setPlaying(true));
  };
  const total = items.reduce((s, p) => s + (dur[p.id] ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="layered flex flex-col gap-4 rounded-[20px] border-[1.5px] border-ink bg-lavender p-5 [--lb:1.5px] [--lx:5px]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-extrabold tracking-[-0.02em]">
            {items.length} ucapan dari tamu
          </h2>
          {total > 0 && <span className="font-mono text-sm">{mmss(total)}</span>}
        </div>
        <button
          type="button"
          onClick={() => {
            setAll(true);
            play(0);
          }}
          className="flex h-12 items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-ink bg-butter text-base font-extrabold"
        >
          ▶ Putar semua berurutan
        </button>
      </div>
      <ul className="flex flex-col gap-2.5">
        {items.map((p, i) => {
          const on = cur === i;
          return (
            <li
              key={p.id}
              className={`flex items-center gap-3.5 rounded-[16px] border-[1.5px] border-ink px-4 py-3 ${on ? "bg-mint-soft" : "bg-white"}`}
            >
              <button
                type="button"
                onClick={() => {
                  setAll(false);
                  play(i);
                }}
                aria-label={on && playing ? `Jeda ucapan ${p.group}` : `Putar ucapan ${p.group}`}
                className="flex size-11 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-white"
              >
                {on && playing ? (
                  <span className="flex gap-1">
                    <span className="h-3.5 w-1 rounded-sm bg-ink" />
                    <span className="h-3.5 w-1 rounded-sm bg-ink" />
                  </span>
                ) : (
                  <span className="ml-0.5 h-0 w-0 border-y-[6px] border-l-[10px] border-y-transparent border-l-ink" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-extrabold">{p.group}</p>
                <p className="font-mono text-xs text-text-2">
                  {on ? `Diputar · ${mmss(pos)}` : p.time}
                </p>
              </div>
              {dur[p.id] !== undefined && (
                <span className="font-mono text-sm">{mmss(dur[p.id] ?? 0)}</span>
              )}
              <button
                type="button"
                onClick={() => onDownload(p)}
                aria-label={`Unduh ucapan ${p.group}`}
                className="flex size-9 flex-none items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-white text-sm font-bold"
              >
                ↓
              </button>
            </li>
          );
        })}
      </ul>
      <audio
        ref={audio}
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (all && cur !== null && cur + 1 < items.length) play(cur + 1);
        }}
        hidden
      >
        <track kind="captions" />
      </audio>
    </div>
  );
}
