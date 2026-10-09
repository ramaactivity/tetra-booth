import { ChevronLeft, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "./copy";
import { storedLut } from "./lut";
import { usePlatform } from "./PlatformContext";
import { type StageTvState, tvMosaic } from "./stage";
import { renderJpeg } from "./stageImage";
import { QrCode, Stage } from "./ui";

const t = copy.stage;
/** Tanpa animasi: galeri idle diam, ganti foto tiap 8 dtk (desain B6). */
const STILL_SLIDE_MS = 8000;
const BROWSE_IDLE_MS = 45_000;
const ROTS = [-1, 1.2, -0.6, 0.8, -1.2];
const REEL_ROTS = [-1.2, 0.8, -0.4, 1.2, -0.8, 0.5];

/** Foto TV cukup 1280 px (layar 1080p); object URL disimpan per path, dibuang saat path tidak dipakai lagi. */
function usePhotos(paths: string[], lut: StageTvState["lut"]) {
  const p = usePlatform();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const cache = useRef(new Map<string, string>());
  const key = paths.join("\n");
  const lutId = lut ? `${lut.key}@${lut.at}` : "";
  const lutSeen = useRef(lutId);
  useEffect(() => {
    let live = true;
    // LUT berganti → semua foto dirender ulang.
    if (lutSeen.current !== lutId) {
      for (const url of cache.current.values()) URL.revokeObjectURL(url);
      cache.current.clear();
      lutSeen.current = lutId;
    }
    const l = lutId ? (storedLut(lutId.slice(0, lutId.lastIndexOf("@")))?.lut ?? null) : null;
    const want = new Set(key ? key.split("\n") : []);
    for (const [path, url] of cache.current)
      if (!want.has(path)) {
        URL.revokeObjectURL(url);
        cache.current.delete(path);
      }
    for (const path of want) {
      if (cache.current.has(path)) continue;
      cache.current.set(path, "");
      void p.storage
        .readFile(path)
        .then((b) => renderJpeg(b, 1280, "none", 0.85, l))
        .then((j) => {
          const url = URL.createObjectURL(new Blob([j], { type: "image/jpeg" }));
          cache.current.set(path, url);
          if (live) setUrls(Object.fromEntries(cache.current));
        })
        .catch(() => cache.current.delete(path));
    }
    setUrls(Object.fromEntries(cache.current));
    return () => {
      live = false;
    };
  }, [key, lutId, p]);
  return urls;
}

const useReducedMotion = () => {
  const [on, setOn] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const m = matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return on;
};

/**
 * Layar TV Photo Stage (#189, desain B4–B6): rombongan baru → nama grup + mosaik foto + QR besar selama `activeSec`
 * setelah jepretan terakhir (bar sisa waktu); selain itu galeri cetakan bergeser + QR galeri acara. Dua lapisan
 * selalu ter-mount (pudar 250 ms), ganti rombongan 160 ms; tanpa animasi saat `prefers-reduced-motion`.
 */
export function StageTv() {
  const p = usePlatform();
  const reduce = useReducedMotion();
  const [st, setSt] = useState<StageTvState | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const tv = p.stage?.tv;
    if (!tv) return;
    void tv.last().then((x) => x && setSt(x));
    return tv.onState(setSt);
  }, [p]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const live = st?.active && now - st.active.at < st.activeSec * 1000 ? st.active : null;
  // Rombongan yang tampil berganti: konten kiri pudar 160 ms, data diganti, lalu muncul lagi.
  const [shown, setShown] = useState(live);
  const [swap, setSwap] = useState(false);
  const liveKey = live ? `${live.id}:${live.shots.length}:${live.label}` : "";
  // biome-ignore lint/correctness/useExhaustiveDependencies: dipicu pergantian isi rombongan saja
  useEffect(() => {
    if (!live) return;
    if (reduce || !shown || shown.id === live.id) return setShown(live);
    setSwap(true);
    const id = setTimeout(() => {
      setShown(live);
      setSwap(false);
    }, 160);
    return () => clearTimeout(id);
  }, [liveKey, reduce]);
  const cur = live ? (shown ?? live) : shown;
  const recent = st?.recent ?? [];
  // "Cari fotomu" (#200): tamu menyentuh TV → daftar rombongan → foto + QR. Kembali sendiri 45 dtk tanpa sentuhan
  // atau saat rombongan baru tampil.
  const [browse, setBrowse] = useState<string | null>(null);
  const [touchedAt, setTouchedAt] = useState(0);
  const groups = st?.groups ?? [];
  const picked = browse && browse !== "list" ? groups.find((g) => g.id === browse) : undefined;
  useEffect(() => {
    if (browse && now - touchedAt > BROWSE_IDLE_MS) setBrowse(null);
  }, [now, browse, touchedAt]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat rombongan baru mulai tampil
  useEffect(() => setBrowse(null), [live?.id]);
  const open = (v: string | null) => {
    setTouchedAt(Date.now());
    setBrowse(v);
  };
  const photos = usePhotos(
    [
      ...(cur?.shots.slice(-5) ?? []),
      ...recent.map((r) => r.path),
      ...(browse === "list" ? groups.slice(0, 24).flatMap((g) => g.shots.slice(0, 1)) : []),
      ...(picked?.shots.slice(-5) ?? []),
    ],
    st?.lut ?? null,
  );
  const filter = st?.filter ?? "none";
  const url = (id: string) => `${st?.guestBaseUrl ?? ""}/s/${id}`;
  const act = !!live;
  const fade = reduce ? "" : "transition-[opacity,transform] duration-[250ms] ease-out";
  const remain = live ? Math.max(0, 1 - (now - live.at) / (st?.activeSec ?? 30) / 1000) : 0;
  // Galeri idle: deret cetakan (dua kali untuk putaran tanpa sambungan); tanpa animasi = geser tiap 8 dtk.
  const shift = reduce && recent.length ? Math.floor(now / STILL_SLIDE_MS) % recent.length : 0;
  const reel = [...recent.slice(shift), ...recent.slice(0, shift)].reverse();

  const findBtn = (cls: string) => (
    <button
      type="button"
      onClick={() => open("list")}
      className={`pressable layered flex h-[92px] items-center justify-center gap-4 rounded-[26px] border-[3px] border-ink bg-butter px-10 text-[34px] font-extrabold tracking-[-0.02em] [--lb:3px] [--lx:8px] ${cls}`}
    >
      <Search className="size-9" strokeWidth={2.75} aria-hidden />
      {t.tvFind}
    </button>
  );
  const mosaic = (shots: string[]) => {
    const m = tvMosaic(Math.min(5, shots.length || 1), 1220, 600, 32);
    return (
      <div className="relative flex-none" style={{ width: m.w, height: m.h }}>
        {shots.slice(-5).map((path, i) => {
          const b = m.boxes[i];
          if (!b) return null;
          return (
            <div
              key={path}
              className="layered absolute rounded-[20px] border-[3px] border-ink bg-white p-3.5 [--lb:3px] [--lx:10px]"
              style={{ left: b.x, top: b.y, transform: `rotate(${ROTS[i]}deg)` }}
            >
              <div
                className="overflow-hidden rounded-lg bg-neutral"
                style={{ width: b.w, height: b.h }}
              >
                {photos[path] && (
                  <img
                    src={photos[path]}
                    alt=""
                    style={{ filter }}
                    className="size-full object-cover"
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Stage>
      <style>
        {"@keyframes tvMarquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}"}
      </style>
      <div
        className="relative h-full overflow-hidden bg-paper"
        data-testid="stage-tv"
        onPointerDown={() => setTouchedAt(Date.now())}
      >
        {st?.test ? (
          <div className="flex h-full items-center justify-center gap-20 p-14">
            <div className="flex max-w-[900px] flex-col gap-6">
              <p className="text-[34px] font-bold text-text-2">{st.eventName}</p>
              <h1 className="text-[104px] leading-[0.95] font-extrabold tracking-[-0.05em]">
                {t.setup.tvTestScreen}
              </h1>
              <p className="text-[34px] leading-[1.35] text-text-3">{t.setup.tvTestScreenSub}</p>
            </div>
            <div className="rounded-[36px] border-[3px] border-ink bg-white p-7">
              <QrCode url={st.galleryUrl ?? st.guestBaseUrl} size={440} />
            </div>
          </div>
        ) : (
          <>
            {/* B5 idle */}
            <div
              className={`absolute inset-0 ${fade}`}
              style={{ opacity: act ? 0 : 1 }}
              aria-hidden={act}
            >
              <div className="absolute top-[84px] left-24 flex max-w-[1150px] flex-col gap-[18px]">
                {st?.tagline && (
                  <span className="self-start whitespace-nowrap rounded-full border-[2.5px] border-ink bg-lavender px-[22px] py-2 text-2xl font-bold">
                    {st.tagline}
                  </span>
                )}
                <span className="text-[150px] leading-[0.9] font-extrabold tracking-[-0.055em] [text-wrap:balance]">
                  {st?.eventName}
                </span>
                {st?.date && <span className="font-mono text-[26px] text-text-3">{st.date}</span>}
              </div>
              <div className="absolute top-[84px] right-24 flex flex-col items-end gap-6">
                {st?.galleryUrl && (
                  <div className="flex items-center gap-6 rounded-[28px] border-[2.5px] border-ink bg-sky py-[18px] pr-[30px] pl-[18px]">
                    <div className="rounded-2xl border-2 border-ink bg-white p-2.5">
                      <QrCode url={st.galleryUrl} size={150} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[30px] leading-[1.1] font-extrabold tracking-[-0.02em] whitespace-pre-line">
                        {t.tvIdleQr}
                      </span>
                      <span className="text-[22px] font-semibold text-text-3">{t.tvIdleQrSub}</span>
                    </div>
                  </div>
                )}
                {!!st?.groups?.length && findBtn("")}
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
                    {[...reel, ...(reduce ? [] : reel)].map((r, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: deret diulang dua kali
                        key={`${r.path}-${i}`}
                        className="layered flex-none rounded-[20px] border-[3px] border-ink bg-white px-3.5 pt-3.5 [--lb:3px] [--lx:10px]"
                        style={{ transform: `rotate(${REEL_ROTS[i % REEL_ROTS.length]}deg)` }}
                      >
                        <div className="h-[400px] w-[600px] overflow-hidden rounded-lg bg-neutral">
                          {photos[r.path] && (
                            <img
                              src={photos[r.path]}
                              alt=""
                              style={{ filter }}
                              className="size-full object-cover"
                            />
                          )}
                        </div>
                        <div className="flex h-[62px] items-center justify-between gap-4 px-1">
                          <span className="truncate text-[22px] font-bold">{r.label}</span>
                          <span className="font-mono text-lg text-text-2">{r.time}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="pt-40 pl-24 text-[44px] font-bold text-text-2">{t.tvIdle}</p>
                )}
              </div>
            </div>

            {/* B4 aktif */}
            {cur && (
              <div
                className={`absolute inset-0 grid grid-cols-[minmax(0,1fr)_560px] ${fade} ${act ? "" : "pointer-events-none"}`}
                style={{
                  opacity: act ? 1 : 0,
                  transform: `translateY(${act || reduce ? 0 : 12}px)`,
                }}
                aria-hidden={!act}
              >
                <div
                  className={`flex min-w-0 flex-col gap-10 pt-[72px] pb-16 pl-[88px] ${reduce ? "" : "transition-opacity duration-[160ms]"}`}
                  style={{ opacity: swap ? 0 : 1 }}
                >
                  <div className="flex flex-col gap-3.5 pr-12">
                    <span className="font-mono text-[28px] text-text-3">
                      {t.group(cur.no)} · {cur.time}
                    </span>
                    <h1
                      className="leading-[0.95] font-extrabold tracking-[-0.05em] [text-wrap:balance]"
                      style={{ fontSize: cur.label.length > 24 ? 92 : 104 }}
                    >
                      {cur.label}
                    </h1>
                  </div>
                  <div className="flex min-h-0 flex-1 items-center">{mosaic(cur.shots)}</div>
                </div>
                <div className="flex flex-col gap-[22px] border-l-[3px] border-ink bg-white px-16 pt-16 pb-12">
                  <div className="layered rounded-[36px] border-[3px] border-ink bg-white p-7 [--lb:3px] [--lx:14px] [--under:var(--butter)]">
                    <QrCode url={url(cur.id)} size={370} />
                  </div>
                  <div className="text-[52px] leading-none font-extrabold tracking-[-0.035em]">
                    {t.tvScan}
                  </div>
                  <div className="h-2 overflow-hidden rounded-full border-2 border-ink bg-white">
                    <div
                      className={`h-full bg-mint ${reduce ? "" : "transition-[width] duration-1000 ease-linear"}`}
                      style={{ width: `${Math.round(remain * 100)}%` }}
                    />
                  </div>
                  <div className="flex-1" />
                  {!!st?.previous.length && (
                    <>
                      <span className="text-[22px] font-bold text-text-3">{t.tvPrev}</span>
                      {st.previous.map((g) => (
                        <div
                          key={g.id}
                          className="flex items-center gap-5 border-t-[2.5px] border-dashed border-ink pt-[18px]"
                        >
                          <div className="flex-none rounded-xl border-2 border-ink bg-white p-1.5">
                            <QrCode url={url(g.id)} size={88} />
                          </div>
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="font-mono text-xl text-text-2">#{g.no}</span>
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
          </>
        )}

        {browse && st && (
          <div
            data-testid="stage-tv-find"
            className="absolute inset-0 z-20 flex flex-col gap-8 bg-paper px-24 pt-[72px] pb-16"
          >
            <div className="flex flex-none items-end gap-8">
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <span className="font-mono text-[28px] text-text-3">
                  {picked ? t.tvGroupAt(picked.no, picked.time) : st.eventName}
                </span>
                <h1 className="truncate pb-2 text-[92px] leading-[1.05] font-extrabold tracking-[-0.05em]">
                  {picked ? picked.label : t.tvFind}
                </h1>
                {!picked && <p className="text-[30px] text-text-3">{t.tvFindSub}</p>}
              </div>
              {picked && (
                <button
                  type="button"
                  onClick={() => open("list")}
                  className="pressable layered flex h-[92px] flex-none items-center gap-3 rounded-[26px] border-[3px] border-ink bg-white px-9 text-[30px] font-extrabold [--lb:3px] [--lx:8px]"
                >
                  <ChevronLeft className="size-9" strokeWidth={2.75} aria-hidden />
                  {t.tvAll}
                </button>
              )}
              <button
                type="button"
                onClick={() => setBrowse(null)}
                className="pressable layered flex h-[92px] flex-none items-center gap-3 rounded-[26px] border-[3px] border-ink bg-white px-9 text-[30px] font-extrabold [--lb:3px] [--lx:8px]"
              >
                <X className="size-9" strokeWidth={2.75} aria-hidden />
                {t.tvClose}
              </button>
            </div>
            {picked ? (
              <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_480px] gap-16">
                <div className="flex min-h-0 items-center">{mosaic(picked.shots)}</div>
                <div className="flex flex-col items-center justify-center gap-6">
                  <div className="layered rounded-[36px] border-[3px] border-ink bg-white p-7 [--lb:3px] [--lx:14px] [--under:var(--butter)]">
                    <QrCode url={url(picked.id)} size={360} />
                  </div>
                  <p className="text-center text-[48px] leading-none font-extrabold tracking-[-0.035em]">
                    {t.tvScan}
                  </p>
                </div>
              </div>
            ) : groups.length ? (
              <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-8 overflow-y-auto overscroll-contain pr-2 pb-4">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => open(g.id)}
                    className="pressable layered flex flex-col gap-3 rounded-[20px] border-[3px] border-ink bg-white p-3.5 text-left [--lb:3px] [--lx:8px]"
                  >
                    <div className="aspect-[3/2] w-full overflow-hidden rounded-lg bg-neutral">
                      {g.shots[0] && photos[g.shots[0]] && (
                        <img
                          src={photos[g.shots[0]]}
                          alt=""
                          style={{ filter }}
                          className="size-full object-cover"
                        />
                      )}
                    </div>
                    <span className="truncate px-1 text-[28px] font-extrabold tracking-[-0.02em]">
                      {g.label}
                    </span>
                    <span className="px-1 font-mono text-xl text-text-2">
                      #{g.no} · {g.time} · {g.shots.length} foto
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[40px] font-bold text-text-2">{t.tvNone}</p>
            )}
          </div>
        )}
      </div>
    </Stage>
  );
}
