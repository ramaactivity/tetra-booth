"use client";
import { Check, ChevronRight, LayoutGrid } from "lucide-react";
import { useRef, useState } from "react";
import { PhotoViewer } from "@/components/PhotoViewer";
import { copy } from "@/lib/copy";
import type { GuestAsset } from "@/lib/guest";
import { save } from "./GuestReady";
import { track } from "./track";

const t = copy.stageGuest;

/**
 * Halaman rombongan Photo Stage (#190, desain C7): nama grup, carousel foto scroll-snap (simpan per foto),
 * titik progres, link galeri acara, "Simpan semua" sticky (share sheet HP, fallback unduh per file).
 */
export function StageGuest({
  sessionId,
  group,
  time,
  assets,
  expiresAt,
  galleryHref,
}: {
  sessionId: string;
  group: string;
  time: string;
  assets: GuestAsset[];
  expiresAt: string | null;
  galleryHref: string | null;
}) {
  const photos = assets.filter((a) => a.kind === "original");
  const n = photos.length;
  const [at, setAt] = useState(0);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [all, setAll] = useState<"idle" | "busy" | "done">("idle");
  const [view, setView] = useState<number | null>(null);
  const rail = useRef<HTMLDivElement>(null);
  const thumbOf = (a: GuestAsset) =>
    assets.find((x) => x.kind === "thumb_original" && x.idx === a.idx)?.url ?? a.url;
  const saveOne = async (i: number) => {
    const a = photos[i];
    if (!a) return;
    track(sessionId, "save");
    await save([a], sessionId);
    setSaved((s) => new Set(s).add(i));
  };
  const saveAll = async () => {
    track(sessionId, "save_all");
    setAll("busy");
    await save(photos, sessionId);
    setAll("done");
  };
  const go = (i: number) =>
    rail.current?.children[i]?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });

  return (
    <>
      <div className="px-5 pb-[18px]">
        <p className="font-mono text-[13px] text-text-3">{t.meta(time, n)}</p>
        <h2 className="mt-1.5 text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] text-balance">
          {group}
        </h2>
      </div>

      <div
        ref={rail}
        data-testid="stage-carousel"
        onScroll={(e) => {
          const el = e.currentTarget;
          const first = el.children[0] as HTMLElement | undefined;
          if (first) setAt(Math.round(el.scrollLeft / (first.offsetWidth + 12)));
        }}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-5 pb-3 [scrollbar-width:none] motion-reduce:scroll-auto"
      >
        {photos.map((a, i) => (
          <div
            key={a.idx}
            className="layered w-[min(342px,calc(100vw-48px))] flex-none snap-start rounded-[18px] border-[1.5px] border-ink bg-white px-2.5 pt-2.5 [--lb:1.5px] [--lx:5px] [--under:#fff]"
          >
            <button
              type="button"
              aria-label={t.photo(i + 1)}
              onClick={() => setView(i)}
              className="block w-full overflow-hidden rounded-[10px] bg-neutral"
            >
              <img
                src={a.url}
                alt=""
                loading={i ? "lazy" : "eager"}
                className="aspect-[3/2] w-full object-cover"
              />
            </button>
            <div className="flex h-[50px] items-center justify-between">
              <span className="font-mono text-[13px] text-text-2">{t.of(i + 1, n)}</span>
              <button
                type="button"
                onClick={() => void saveOne(i)}
                className={`pressable flex h-[34px] items-center gap-1 rounded-[10px] border-[1.5px] border-ink px-3.5 text-[13px] font-bold ${saved.has(i) ? "bg-mint-soft" : "bg-white"}`}
              >
                {saved.has(i) ? t.saved : t.save}
                {saved.has(i) && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {n > 1 && (
        <div className="flex items-center justify-center py-2.5" aria-hidden>
          {photos.map((a, i) => (
            <span key={a.idx} className="flex items-center">
              {i > 0 && <span className="w-[22px] border-t-[1.5px] border-ink" />}
              <button
                type="button"
                tabIndex={-1}
                onClick={() => go(i)}
                className={`size-4 rounded-full border-[1.5px] border-ink ${i === at ? "bg-ink" : "bg-white"}`}
              />
            </span>
          ))}
        </div>
      )}

      {galleryHref && (
        <a
          href={galleryHref}
          className="mx-5 mt-3.5 mb-6 flex items-center gap-3.5 rounded-[22px] border-[1.5px] border-ink bg-white px-4 py-3.5 no-underline"
        >
          <span className="flex size-[46px] flex-none items-center justify-center rounded-xl border-[1.5px] border-dashed border-ink bg-peach">
            <LayoutGrid className="size-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[17px] font-extrabold tracking-[-0.01em]">{t.galleryTitle}</span>
            <span className="text-sm text-text-2">{t.gallerySub}</span>
          </span>
          <ChevronRight className="size-5 flex-none" strokeWidth={2.5} aria-hidden />
        </a>
      )}

      <footer className="sticky bottom-0 mt-auto flex flex-col gap-2.5 border-t-[1.5px] border-dashed border-ink bg-paper px-5 pt-4 pb-5">
        <button
          type="button"
          disabled={!n || all === "busy"}
          onClick={() => void saveAll()}
          className={`pressable layered flex h-14 items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-ink text-[17px] font-extrabold [--lb:1.5px] [--lx:4px] ${all === "done" ? "bg-mint-soft" : "bg-butter"}`}
        >
          {all === "busy" ? t.preparing(n) : all === "done" ? t.savedAll : t.saveAll(n)}
          {all === "done" && <Check className="size-4" strokeWidth={3} aria-hidden />}
        </button>
        <div className="flex items-center justify-between text-[11px] text-text-2">
          <span>
            {expiresAt && (
              <>
                {t.until} <span className="font-mono">{expiresAt}</span>
              </>
            )}
          </span>
          <span>{t.powered}</span>
        </div>
      </footer>

      {view !== null && (
        <PhotoViewer
          items={photos.map((a) => ({ src: a.url, thumb: thumbOf(a) }))}
          index={view}
          onIndex={setView}
          onClose={() => setView(null)}
        />
      )}
    </>
  );
}
