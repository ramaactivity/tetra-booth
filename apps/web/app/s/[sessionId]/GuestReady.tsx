"use client";
import { Check, Images, Share2 } from "lucide-react";
import { type CSSProperties, useRef, useState } from "react";
import { PROMO_SAVED } from "@/components/GuestPromo";
import { PhotoViewer } from "@/components/PhotoViewer";
import { copy } from "@/lib/copy";
import type { GuestAsset } from "@/lib/guest";
import { track } from "./track";

const t = copy.guest;

/** Simpan, lalu beri tahu kartu promosi (#215: pop-up sekali setelah tamu menyimpan foto). */
export async function save(assets: GuestAsset[], sessionId: string) {
  await saveAssets(assets, sessionId);
  window.dispatchEvent(new Event(PROMO_SAVED));
}

/** Simpan lewat share sheet (masuk galeri HP); fallback unduh; tanpa CORS → buka gambarnya di tab baru. */
async function saveAssets(assets: GuestAsset[], sessionId: string) {
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

type Tab = "strip" | "original" | "animation" | "video";

/** Notifikasi kecil di atas tombol aksi (#217): muncul, lalu hilang sendiri. */
export function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = (m: string) => {
    clearTimeout(timer.current);
    setToast(m);
    timer.current = setTimeout(() => setToast(null), 2600);
  };
  const node = toast && (
    <p
      role="status"
      key={toast}
      className="animate-pop pointer-events-none absolute inset-x-0 -top-14 mx-auto flex w-fit items-center gap-2 rounded-full border-[1.5px] border-ink bg-ink px-4 py-2.5 text-sm font-bold text-white"
    >
      <Check size={16} strokeWidth={3} />
      {toast}
    </p>
  );
  return { show, node };
}

/** Bagikan link halaman ini (teman ikut melihat foto + kenal Tetra); tanpa Web Share → salin link. */
export async function shareLink(eventName: string, done: (m: string) => void) {
  const data = { title: eventName, text: t.shareText(eventName), url: location.href };
  if (navigator.share) {
    await navigator.share(data).catch(() => {});
    return;
  }
  await navigator.clipboard?.writeText(location.href).then(
    () => done(t.linkCopied),
    () => {},
  );
}

export function GuestReady({
  sessionId,
  eventName,
  assets,
  expiresAt,
  stage = false,
}: {
  sessionId: string;
  eventName: string;
  assets: GuestAsset[];
  expiresAt: string | null;
  /** Photo Stage (#180): foto fotografer tanpa strip; langsung tab Original, simpan semua jadi aksi utama. */
  stage?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(stage ? "original" : "strip");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
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
      toast.show(t.saved);
    };
  const tabs: [Tab, string][] = [
    ["strip", t.strip],
    ["original", t.original],
    ...(gif ? [["animation", t.animation] as [Tab, string]] : []),
    ...(video ? [["video", t.video] as [Tab, string]] : []),
  ];
  const at = tabs.findIndex(([k]) => k === tab);
  const media =
    "layered max-h-[62vh] max-w-full rounded-lg border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px] [--under:#fff]";

  return (
    <>
      {!stage && (
        // Segmented control: penanda lavender bergeser ke tab aktif.
        <div
          role="tablist"
          style={{ "--d": "180ms" } as CSSProperties}
          className="animate-rise relative mx-5 mt-5 flex rounded-[14px] border-[1.5px] border-ink bg-white p-1"
        >
          <span
            aria-hidden
            style={{
              width: `calc((100% - 8px) / ${tabs.length})`,
              transform: `translateX(${at * 100}%)`,
            }}
            className="absolute inset-y-1 left-1 rounded-[10px] border-[1.5px] border-ink bg-lavender transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          />
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`relative z-10 flex h-10 flex-1 items-center justify-center text-[13px] transition-[font-weight] ${tab === k ? "font-extrabold" : "font-semibold text-text-2"}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-1 flex-col items-center px-5 pt-6 pb-8">
        {tab === "strip" && strip && (
          // Strip "keluar dari slot printer" seperti di booth.
          <div className="flex w-full flex-col items-center">
            <span className="h-3 w-[86%] rounded-full border-[1.5px] border-ink bg-ink" />
            <div className="-mt-1.5 flex w-[80%] justify-center overflow-hidden px-2 pt-1.5 pb-3">
              <button
                type="button"
                aria-label={t.strip}
                onClick={() => setView({ list: [strip], i: 0 })}
                style={{ "--d": "200ms" } as CSSProperties}
                className="animate-print flex justify-center"
              >
                <img
                  src={strip.url}
                  alt=""
                  fetchPriority="high"
                  className={`${media} max-h-[48vh]!`}
                />
              </button>
            </div>
            <p className="mt-1 font-mono text-[11px] text-text-2">{t.tapToView}</p>
          </div>
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
            className={`animate-rise ${media}`}
          />
        )}
        {tab === "animation" && gif && (
          <button
            type="button"
            aria-label={t.animation}
            onClick={() => setView({ list: [gif], i: 0 })}
            className="animate-rise max-w-full"
          >
            <img src={gif.url} alt="" className={media} />
          </button>
        )}
        {tab === "original" && (
          // Foto pertama lebar penuh, sisanya 2 kolom; muncul berurutan.
          <div className="grid w-full grid-cols-2 gap-3">
            {originals.map((o, i) => (
              <button
                key={o.idx}
                type="button"
                aria-label={`${t.original} ${o.idx}`}
                onClick={() => setView({ list: originals, i })}
                style={{ "--d": `${Math.min(i, 8) * 60}ms` } as CSSProperties}
                className={`animate-rise pressable overflow-hidden rounded-xl border-[1.5px] border-ink bg-neutral ${i === 0 ? "col-span-2" : ""}`}
              >
                <img
                  src={thumbOf(o)}
                  alt=""
                  loading={i < 3 ? "eager" : "lazy"}
                  className="aspect-[3/2] w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 flex flex-col gap-2.5 border-t-[1.5px] border-ink bg-paper px-5 pt-3.5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {toast.node}
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={busy || (stage ? !originals.length : !main)}
            onClick={stage ? run(originals, true) : run(main ? [main] : [])}
            className="pressable layered h-[54px] flex-1 rounded-[14px] border-[1.5px] border-ink bg-butter px-4 text-base font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-40"
          >
            {busy
              ? t.saving
              : stage
                ? t.saveAllStage
                : tab === "animation"
                  ? t.saveGif
                  : tab === "video"
                    ? t.saveVideo
                    : t.saveStrip}
          </button>
          <button
            type="button"
            aria-label={t.share}
            onClick={() => shareLink(eventName, toast.show)}
            className="pressable layered flex size-[54px] flex-none items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:4px]"
          >
            <Share2 size={20} strokeWidth={2.5} />
          </button>
        </div>
        <div className="flex min-h-8 items-center justify-between gap-3 text-[11px] text-text-2">
          {!stage && originals.length > 0 ? (
            <button
              type="button"
              disabled={busy}
              onClick={run(originals, true)}
              className="flex min-h-8 items-center gap-1.5 text-[13px] font-bold text-ink underline disabled:opacity-40"
            >
              <Images size={15} strokeWidth={2.5} />
              {t.saveAll}
            </button>
          ) : (
            <span />
          )}
          {expiresAt && (
            <span>
              {t.availableUntil}{" "}
              <span className="font-mono" data-expires>
                {expiresAt}
              </span>
            </span>
          )}
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
