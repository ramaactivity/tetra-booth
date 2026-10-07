import { useEffect, useRef, useState } from "react";
import { copy } from "./copy";
import { storedLut } from "./lut";
import { usePlatform } from "./PlatformContext";
import type { StageTvState } from "./stage";
import { renderJpeg } from "./stageImage";
import { QrCode, Stage } from "./ui";

const t = copy.stage;
const IDLE_SLIDE_MS = 5000;
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

/**
 * Layar TV Photo Stage (#179, docs/PLAN-PHOTO-STAGE.md §5): jendela layar penuh di layar kedua. Rombongan baru →
 * nama grup + foto + QR besar selama `activeSec` setelah jepretan terakhir; selain itu galeri berjalan.
 * Tampilan sementara; desain final dari Claude Design.
 */
export function StageTv() {
  const p = usePlatform();
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
  const active = st?.active && now - st.active.at < st.activeSec * 1000 ? st.active : null;
  const photos = usePhotos(active ? active.shots : (st?.recent ?? []), st?.lut ?? null);
  const slide = st?.recent.length
    ? st.recent[Math.floor(now / IDLE_SLIDE_MS) % st.recent.length]
    : undefined;
  const filter = st?.filter ?? "none";
  const url = (id: string) => `${st?.guestBaseUrl ?? ""}/s/${id}`;

  return (
    <Stage>
      <div className="flex h-full flex-col bg-paper p-14" data-testid="stage-tv">
        {st?.test ? (
          <div className="flex flex-1 items-center justify-center gap-20">
            <div className="flex max-w-[900px] flex-col gap-6">
              <p className="text-[34px] font-bold text-text-2">{st.eventName}</p>
              <h1 className="text-[104px] leading-[0.95] font-extrabold tracking-[-0.05em]">
                {copy.stage.setup.tvTestScreen}
              </h1>
              <p className="text-[34px] leading-[1.35] text-text-3">
                {copy.stage.setup.tvTestScreenSub}
              </p>
            </div>
            <div className="rounded-[36px] border-[3px] border-ink bg-white p-7">
              <QrCode url={st.guestBaseUrl} size={440} />
            </div>
          </div>
        ) : active ? (
          <div className="flex min-h-0 flex-1 gap-14">
            <div className="flex min-w-0 flex-1 flex-col gap-8">
              <div>
                <p className="text-[34px] font-bold text-text-2">{t.group(active.no)}</p>
                <h1 className="text-[76px] leading-[1.05] font-extrabold tracking-[-0.03em]">
                  {active.label}
                </h1>
              </div>
              <div
                className={`grid min-h-0 flex-1 gap-6 ${active.shots.length === 1 ? "grid-cols-1" : active.shots.length <= 4 ? "grid-cols-2" : "grid-cols-3"}`}
              >
                {active.shots.map((path) => (
                  <div
                    key={path}
                    className="min-h-0 overflow-hidden rounded-2xl border-[3px] border-ink bg-white p-3"
                  >
                    {photos[path] && (
                      <img
                        src={photos[path]}
                        alt=""
                        style={{ filter }}
                        className="size-full rounded-lg object-contain"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex w-[560px] flex-col items-center justify-center gap-8">
              <div className="rounded-[28px] border-[3px] border-ink bg-white p-8">
                <QrCode url={url(active.id)} size={440} />
              </div>
              <p className="text-center text-[44px] font-extrabold">{t.tvScan}</p>
              {!!st?.previous.length && (
                <div className="flex w-full flex-col gap-3">
                  <p className="text-2xl font-bold text-text-2">{t.tvPrev}</p>
                  <div className="flex gap-4">
                    {st.previous.map((g) => (
                      <div
                        key={g.id}
                        className="flex flex-1 items-center gap-3 rounded-2xl border-2 border-ink bg-white p-3"
                      >
                        <QrCode url={url(g.id)} size={110} />
                        <p className="min-w-0 text-xl font-bold">
                          <span className="block text-text-2">#{g.no}</span>
                          <span className="line-clamp-2">{g.label}</span>
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-[28px] border-[3px] border-ink bg-white">
            {slide && photos[slide] ? (
              <img
                key={slide}
                src={photos[slide]}
                alt=""
                style={{ filter }}
                className="size-full object-contain"
              />
            ) : (
              <p className="text-[44px] font-bold text-text-2">{t.tvIdle}</p>
            )}
            {st && (
              <p className="absolute bottom-8 left-10 rounded-2xl border-[3px] border-ink bg-white px-6 py-3 text-[34px] font-extrabold">
                {st.eventName}
              </p>
            )}
          </div>
        )}
      </div>
    </Stage>
  );
}
