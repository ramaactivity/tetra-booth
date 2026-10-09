"use client";
import { tvMosaic } from "@tetra/shared";
import { QrCode } from "@tetra/ui";
import { ChevronLeft, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import type { StageDisplay, StageDisplayGroup } from "@/lib/stage-display";

const t = copy.stageDisplay;
const W = 1920;
const H = 1080;
const POLL_MS = 5000;
const BROWSE_IDLE_MS = 45_000;
const ROTS = [-1, 1.2, -0.6, 0.8, -1.2];
const REEL_ROTS = [-1.2, 0.8, -0.4, 1.2, -0.8, 0.5];

/**
 * Layar galeri Photo Stage di device kedua (#203, sama dengan TV laptop stage #189/#200): rombongan terbaru besar
 * + QR selama `activeSec` setelah fotonya sampai, galeri berjalan + QR galeri saat idle, "Cari fotomu" untuk tamu
 * di layar sentuh. Data di-poll dari cloud tiap 5 dtk; kanvas 1920×1080 diskalakan ke layar.
 */
export function StageDisplayView({
  token,
  origin,
  initial,
}: {
  token: string;
  origin: string;
  initial: StageDisplay;
}) {
  const [d, setD] = useState(initial);
  // 0 sampai terpasang di browser: render server & hidrasi pertama sama (tanpa status aktif yang bergantung jam).
  const [now, setNow] = useState(0);
  const [scale, setScale] = useState(1);
  const [browse, setBrowse] = useState<string | null>(null);
  const [touchedAt, setTouchedAt] = useState(0);
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(m.matches);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    const poll = setInterval(async () => {
      const res = await fetch(`/api/stage/${token}`, { cache: "no-store" }).catch(() => null);
      if (res?.ok) setD((await res.json()) as StageDisplay);
    }, POLL_MS);
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [token]);

  const top = d.groups[0];
  const live = top && now && now - top.lastAt < d.activeSec * 1000 ? top : null;
  // Rombongan baru tampil → tamu yang sedang mencari dikembalikan ke tampilan utama.
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat rombongan baru mulai tampil
  useEffect(() => setBrowse(null), [live?.id]);
  useEffect(() => {
    if (browse && now - touchedAt > BROWSE_IDLE_MS) setBrowse(null);
  }, [now, browse, touchedAt]);
  const open = (v: string | null) => {
    setTouchedAt(Date.now());
    setBrowse(v);
  };
  const picked = browse && browse !== "list" ? d.groups.find((g) => g.id === browse) : undefined;
  const url = (id: string) => `${origin}/s/${id}`;
  const galleryUrl = d.event.publicGallery ? `${origin}/l/${token}` : null;
  const reel = d.groups.slice(0, 12).reverse();
  const remain = live ? Math.max(0, 1 - (now - live.lastAt) / (d.activeSec * 1000)) : 0;
  const fade = reduce ? "" : "transition-[opacity,transform] duration-[250ms] ease-out";
  const date = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${d.event.date}T00:00:00Z`))
    .replaceAll("/", ".");

  const findBtn = (cls: string) => (
    <button
      type="button"
      onClick={() => open("list")}
      className={`pressable layered flex h-[92px] items-center justify-center gap-4 rounded-[26px] border-[3px] border-ink bg-butter px-10 text-[34px] font-extrabold tracking-[-0.02em] [--lb:3px] [--lx:8px] ${cls}`}
    >
      <Search className="size-9" strokeWidth={2.75} aria-hidden />
      {t.find}
    </button>
  );
  const mosaic = (g: StageDisplayGroup) => {
    const shots = g.photos.slice(-5);
    const m = tvMosaic(Math.min(5, shots.length || 1), 1220, 600, 32);
    return (
      <div className="relative flex-none" style={{ width: m.w, height: m.h }}>
        {shots.map((ph, i) => {
          const b = m.boxes[i];
          if (!b) return null;
          return (
            <div
              key={ph.full}
              className="layered absolute rounded-[20px] border-[3px] border-ink bg-white p-3.5 [--lb:3px] [--lx:10px]"
              style={{ left: b.x, top: b.y, transform: `rotate(${ROTS[i]}deg)` }}
            >
              <img
                src={ph.full}
                alt=""
                className="rounded-lg bg-neutral object-cover"
                style={{ width: b.w, height: b.h }}
              />
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-paper">
      <style>
        {"@keyframes tvMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}"}
      </style>
      <div
        data-testid="stage-display"
        onPointerDown={() => setTouchedAt(Date.now())}
        style={{ width: W, height: H, transform: `scale(${scale})` }}
        className="relative flex-none origin-center overflow-hidden bg-paper"
      >
        {/* Idle: nama acara, QR galeri, deret cetakan */}
        <div
          className={`absolute inset-0 ${fade}`}
          style={{ opacity: live ? 0 : 1 }}
          aria-hidden={!!live}
        >
          <div className="absolute top-[84px] left-24 flex max-w-[1150px] flex-col gap-[18px]">
            {d.event.tagline && (
              <span className="self-start whitespace-nowrap rounded-full border-[2.5px] border-ink bg-lavender px-[22px] py-2 text-2xl font-bold">
                {d.event.tagline}
              </span>
            )}
            <span className="text-[150px] leading-[0.9] font-extrabold tracking-[-0.055em] [text-wrap:balance]">
              {d.event.name}
            </span>
            <span className="font-mono text-[26px] text-text-3">{date}</span>
          </div>
          <div className="absolute top-[84px] right-24 flex flex-col items-end gap-6">
            {galleryUrl && (
              <div className="flex items-center gap-6 rounded-[28px] border-[2.5px] border-ink bg-sky py-[18px] pr-[30px] pl-[18px]">
                <div className="rounded-2xl border-2 border-ink bg-white p-2.5">
                  <QrCode url={galleryUrl} size={150} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="whitespace-pre-line text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em]">
                    {t.galleryQr}
                  </span>
                  <span className="text-[22px] font-semibold text-text-3">{t.galleryQrSub}</span>
                </div>
              </div>
            )}
            {!!d.groups.length && findBtn("")}
          </div>
          <div className="absolute inset-x-0 bottom-[84px] h-[520px] overflow-hidden">
            {reel.length ? (
              <div
                className="flex w-max gap-11 pt-4 pl-24"
                style={{
                  animation: reduce
                    ? "none"
                    : `tvMarquee ${Math.max(30, reel.length * 15)}s linear infinite`,
                }}
              >
                {[...reel, ...(reduce ? [] : reel)].map((g, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: deret diulang dua kali
                    key={`${g.id}-${i}`}
                    className="layered flex-none rounded-[20px] border-[3px] border-ink bg-white px-3.5 pt-3.5 [--lb:3px] [--lx:10px]"
                    style={{ transform: `rotate(${REEL_ROTS[i % REEL_ROTS.length]}deg)` }}
                  >
                    <img
                      src={g.photos[0]?.full}
                      alt=""
                      className="h-[400px] w-[600px] rounded-lg bg-neutral object-cover"
                    />
                    <div className="flex h-[62px] items-center justify-between gap-4 px-1">
                      <span className="truncate text-[22px] font-bold">{g.label}</span>
                      <span className="font-mono text-lg text-text-2">{g.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pt-40 pl-24 text-[44px] font-bold text-text-2">{t.idle}</p>
            )}
          </div>
        </div>

        {/* Aktif: rombongan terbaru + QR besar */}
        {live && (
          <div
            className="absolute inset-0 grid grid-cols-[minmax(0,1fr)_560px]"
            aria-hidden={false}
          >
            <div className="flex min-w-0 flex-col gap-10 pt-[72px] pb-16 pl-[88px]">
              <div className="flex flex-col gap-3.5 pr-12">
                <span className="font-mono text-[28px] text-text-3">{t.group(live.time)}</span>
                <h1
                  className="leading-[0.95] font-extrabold tracking-[-0.05em] [text-wrap:balance]"
                  style={{ fontSize: live.label.length > 24 ? 92 : 104 }}
                >
                  {live.label}
                </h1>
              </div>
              <div className="flex min-h-0 flex-1 items-center">{mosaic(live)}</div>
            </div>
            <div className="flex flex-col gap-[22px] border-l-[3px] border-ink bg-white px-16 pt-16 pb-12">
              <div className="layered rounded-[36px] border-[3px] border-ink bg-white p-7 [--lb:3px] [--lx:14px] [--under:var(--butter)]">
                <QrCode url={url(live.id)} size={370} />
              </div>
              <div className="text-[52px] leading-none font-extrabold tracking-[-0.035em]">
                {t.scan}
              </div>
              <div className="h-2 overflow-hidden rounded-full border-2 border-ink bg-white">
                <div
                  className={`h-full bg-mint ${reduce ? "" : "transition-[width] duration-1000 ease-linear"}`}
                  style={{ width: `${Math.round(remain * 100)}%` }}
                />
              </div>
              <div className="flex-1" />
              {d.groups.length > 1 && (
                <>
                  <span className="text-[22px] font-bold text-text-3">{t.prev}</span>
                  {d.groups.slice(1, 3).map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center gap-5 border-t-[2.5px] border-dashed border-ink pt-[18px]"
                    >
                      <div className="flex-none rounded-xl border-2 border-ink bg-white p-1.5">
                        <QrCode url={url(g.id)} size={88} />
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-mono text-xl text-text-2">{g.time}</span>
                        <span className="line-clamp-2 text-[26px] leading-[1.15] font-extrabold tracking-[-0.02em]">
                          {g.label}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {findBtn("h-[72px] text-[28px] [--lx:6px]")}
            </div>
          </div>
        )}

        {/* Cari fotomu */}
        {browse && (
          <div
            data-testid="stage-display-find"
            className="absolute inset-0 z-20 flex flex-col gap-8 bg-paper px-24 pt-[72px] pb-16"
          >
            <div className="flex flex-none items-end gap-8">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <span className="font-mono text-[28px] text-text-3">
                  {picked ? t.group(picked.time) : d.event.name}
                </span>
                <h1 className="truncate pb-2 text-[92px] leading-[1.05] font-extrabold tracking-[-0.05em]">
                  {picked ? picked.label : t.find}
                </h1>
                {!picked && <p className="text-[30px] text-text-3">{t.findSub}</p>}
              </div>
              {picked && (
                <button
                  type="button"
                  onClick={() => open("list")}
                  className="pressable layered flex h-[92px] flex-none items-center gap-3 rounded-[26px] border-[3px] border-ink bg-white px-9 text-[30px] font-extrabold [--lb:3px] [--lx:8px]"
                >
                  <ChevronLeft className="size-9" strokeWidth={2.75} aria-hidden />
                  {t.all}
                </button>
              )}
              <button
                type="button"
                onClick={() => setBrowse(null)}
                className="pressable layered flex h-[92px] flex-none items-center gap-3 rounded-[26px] border-[3px] border-ink bg-white px-9 text-[30px] font-extrabold [--lb:3px] [--lx:8px]"
              >
                <X className="size-9" strokeWidth={2.75} aria-hidden />
                {t.close}
              </button>
            </div>
            {picked ? (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_480px] gap-16">
                <div className="flex min-h-0 items-center">{mosaic(picked)}</div>
                <div className="flex flex-col items-center justify-center gap-6">
                  <div className="layered rounded-[36px] border-[3px] border-ink bg-white p-7 [--lb:3px] [--lx:14px] [--under:var(--butter)]">
                    <QrCode url={url(picked.id)} size={360} />
                  </div>
                  <p className="text-center text-[48px] leading-none font-extrabold tracking-[-0.035em]">
                    {t.scan}
                  </p>
                </div>
              </div>
            ) : d.groups.length ? (
              <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-8 overflow-y-auto overscroll-contain pr-2 pb-4">
                {d.groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => open(g.id)}
                    className="pressable layered flex flex-col gap-3 rounded-[20px] border-[3px] border-ink bg-white p-3.5 text-left [--lb:3px] [--lx:8px]"
                  >
                    <img
                      src={g.photos[0]?.thumb}
                      alt=""
                      className="aspect-[3/2] w-full rounded-lg bg-neutral object-cover"
                    />
                    <span className="truncate px-1 text-[28px] font-extrabold tracking-[-0.02em]">
                      {g.label}
                    </span>
                    <span className="px-1 font-mono text-xl text-text-2">
                      {g.time} · {t.photos(g.photos.length)}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[40px] font-bold text-text-2">{t.none}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
