"use client";
import { useState } from "react";
import { PhotoViewer } from "@/components/PhotoViewer";
import { copy } from "@/lib/copy";
import type { GuestAsset } from "@/lib/guest";
import { track } from "./track";

const t = copy.guest;

/** Simpan lewat share sheet (masuk galeri HP); fallback unduh; tanpa CORS → buka gambarnya di tab baru. */
async function save(assets: GuestAsset[], sessionId: string) {
  let files: File[];
  try {
    files = await Promise.all(
      assets.map(async (a) => {
        const res = await fetch(a.url);
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const ext = a.kind === "animation" ? "gif" : a.kind === "video" ? "mp4" : "jpg";
        const fallback = { gif: "image/gif", mp4: "video/mp4", jpg: "image/jpeg" }[ext];
        return new File([blob], `tetra-${sessionId}-${a.kind}-${a.idx}.${ext}`, {
          type: blob.type || fallback,
        });
      }),
    );
  } catch {
    // Tanpa CORS: unduh langsung lewat URL attachment (bukan membuka gambar di tab baru).
    for (const a of assets) {
      const link = document.createElement("a");
      link.href = a.download;
      link.rel = "noopener";
      document.body.append(link);
      link.click();
      link.remove();
    }
    return;
  }
  if (navigator.canShare?.({ files })) {
    await navigator.share({ files }).catch(() => {});
    return;
  }
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  }
}

export function GuestReady({
  sessionId,
  assets,
  expiresAt,
  stage = false,
}: {
  sessionId: string;
  assets: GuestAsset[];
  expiresAt: string | null;
  /** Photo Stage (#180): foto fotografer tanpa strip; langsung tab Original, simpan semua jadi aksi utama. */
  stage?: boolean;
}) {
  const [tab, setTab] = useState<"strip" | "original" | "animation" | "video">(
    stage ? "original" : "strip",
  );
  const [busy, setBusy] = useState(false);
  // Penampil layar penuh: set foto yang dibuka + posisi.
  const [view, setView] = useState<{ list: GuestAsset[]; i: number } | null>(null);
  const strip = assets.find((a) => a.kind === "strip_web");
  const originals = assets.filter((a) => a.kind === "original");
  const thumbOf = (a: GuestAsset) =>
    assets.find((x) => x.kind === "thumb_original" && x.idx === a.idx)?.url ?? a.url;
  const gif = assets.find((a) => a.kind === "animation");
  // Video hitung mundur (#117).
  const video = assets.find((a) => a.kind === "video");
  const main = tab === "animation" ? gif : tab === "video" ? video : strip;
  const run =
    (list: GuestAsset[], all = false) =>
    async () => {
      track(sessionId, all ? "save_all" : "save");
      setBusy(true);
      await save(list, sessionId);
      setBusy(false);
    };
  const tabClass = (on: boolean) =>
    `flex h-11 flex-1 items-center justify-center px-1 text-[13px] ${on ? "bg-lavender font-bold" : "font-semibold"}`;

  return (
    <>
      {!stage && (
        <div
          className="mx-5 flex overflow-hidden rounded-xl border-[1.5px] border-ink bg-white"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "strip"}
            className={tabClass(tab === "strip")}
            onClick={() => setTab("strip")}
          >
            {t.strip}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "original"}
            className={`${tabClass(tab === "original")} border-l-[1.5px] border-ink`}
            onClick={() => setTab("original")}
          >
            {t.original}
          </button>
          {gif && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "animation"}
              className={`${tabClass(tab === "animation")} border-l-[1.5px] border-ink`}
              onClick={() => setTab("animation")}
            >
              {t.animation}
            </button>
          )}
          {video && (
            <button
              type="button"
              role="tab"
              aria-selected={tab === "video"}
              className={`${tabClass(tab === "video")} border-l-[1.5px] border-ink`}
              onClick={() => setTab("video")}
            >
              {t.video}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col items-center px-5 pt-5 pb-6">
        {tab === "strip" && strip && (
          <button
            type="button"
            aria-label={t.strip}
            onClick={() => setView({ list: [strip], i: 0 })}
            className="flex max-w-[66%] justify-center"
          >
            <img
              src={strip.url}
              alt=""
              fetchPriority="high"
              className="layered max-h-[62vh] max-w-full rounded-lg border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px] [--under:#fff]"
            />
          </button>
        )}
        {tab === "video" && video && (
          // biome-ignore lint/a11y/useMediaCaption: video momen booth tanpa suara/ucapan
          <video
            src={video.url}
            controls
            autoPlay
            muted
            loop
            playsInline
            className="layered max-h-[62vh] max-w-full rounded-lg border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px] [--under:#fff]"
          />
        )}
        {tab === "animation" && gif && (
          <button
            type="button"
            aria-label={t.animation}
            onClick={() => setView({ list: [gif], i: 0 })}
            className="max-w-full"
          >
            <img
              src={gif.url}
              alt=""
              className="layered max-w-full rounded-lg border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px] [--under:#fff]"
            />
          </button>
        )}
        {tab === "original" && (
          <div className="grid w-full grid-cols-2 gap-3">
            {originals.map((o, i) => (
              <button
                key={o.idx}
                type="button"
                aria-label={`${t.original} ${o.idx}`}
                onClick={() => setView({ list: originals, i })}
                className="pressable overflow-hidden rounded-lg border-[1.5px] border-ink bg-white"
              >
                <img
                  src={thumbOf(o)}
                  alt=""
                  loading="lazy"
                  className="aspect-[3/2] w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 flex flex-col gap-2.5 border-t-[1.5px] border-dashed border-ink bg-paper px-5 pt-3.5 pb-6">
        {!stage && (
          <button
            type="button"
            disabled={busy || !main}
            onClick={run(main ? [main] : [])}
            className="pressable layered h-[52px] rounded-[14px] border-[1.5px] border-ink bg-butter px-4 text-base font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-40"
          >
            {busy
              ? t.saving
              : tab === "animation"
                ? t.saveGif
                : tab === "video"
                  ? t.saveVideo
                  : t.saveStrip}
          </button>
        )}
        <button
          type="button"
          disabled={busy || !originals.length}
          onClick={run(originals, true)}
          className={
            stage
              ? "pressable layered h-[52px] rounded-[14px] border-[1.5px] border-ink bg-butter px-4 text-base font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-40"
              : "pressable h-12 rounded-[14px] border-[1.5px] border-ink bg-white px-4 text-[15px] font-bold disabled:opacity-40"
          }
        >
          {stage ? t.saveAllStage : t.saveAll}
        </button>
        <div className="flex justify-between gap-3 text-xs text-text-2">
          {expiresAt ? (
            <span>
              {t.availableUntil}{" "}
              <span className="font-mono" data-expires>
                {expiresAt}
              </span>
            </span>
          ) : (
            <span />
          )}
          <span>{t.poweredBy}</span>
        </div>
      </footer>

      {view && (
        <PhotoViewer
          items={view.list.map((a) => ({
            src: a.url,
            thumb: a.kind === "original" ? thumbOf(a) : a.url,
          }))}
          index={view.i}
          onIndex={(i) => setView({ ...view, i })}
          onClose={() => setView(null)}
        >
          <button
            type="button"
            disabled={busy}
            onClick={run(view.list.slice(view.i, view.i + 1))}
            className="pressable h-12 rounded-[14px] border-[1.5px] border-ink bg-butter px-3 text-[15px] font-extrabold disabled:opacity-40"
          >
            {busy ? t.saving : view.list[view.i]?.kind === "animation" ? t.saveGif : t.saveOne}
          </button>
        </PhotoViewer>
      )}
    </>
  );
}
