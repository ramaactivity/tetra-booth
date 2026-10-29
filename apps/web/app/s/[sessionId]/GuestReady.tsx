"use client";
import { Check, Share2 } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { PhotoViewer } from "@/components/PhotoViewer";
import { copy } from "@/lib/copy";
import type { GuestAsset } from "@/lib/guest";
import { isApple, prefetch, saveToPhone } from "./save";
import { track } from "./track";

const t = copy.guest;

/** Simpan beberapa aset sekaligus (Photo Stage memakai ini tanpa nama acara). */
export async function save(assets: GuestAsset[], sessionId: string) {
  await saveToPhone(assets, "tetra", sessionId);
}

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

/** Urutan tampil = urutan simpan: strip, foto asli, animasi, video. */
const ORDER = ["strip_web", "original", "animation", "video"];

/**
 * Hasil foto tamu (revisi 29 Okt, Rama): satu halaman tanpa tab. Strip besar di atas (muat satu layar), sisanya dua
 * kolom dengan bentuk asli (tidak dipotong). Tombol utama menyimpan SEMUA ke galeri HP; ketuk satu foto = pratinjau
 * penuh + simpan satuan. Photo Stage (#180) tanpa strip: daftar yang sama, hanya foto.
 */
export function GuestReady({
  sessionId,
  eventName,
  assets,
  expiresAt,
}: {
  sessionId: string;
  eventName: string;
  assets: GuestAsset[];
  expiresAt: string | null;
}) {
  const items = assets
    .filter((a) => ORDER.includes(a.kind))
    .sort((x, y) => ORDER.indexOf(x.kind) - ORDER.indexOf(y.kind) || x.idx - y.idx);
  const [strip, rest] =
    items[0]?.kind === "strip_web" ? [items[0], items.slice(1)] : [undefined, items];
  const thumbOf = (a: GuestAsset) =>
    assets.find((x) => x.kind === "thumb_original" && x.idx === a.idx)?.url ?? a.url;
  const label = (a: GuestAsset) =>
    a.kind === "strip_web"
      ? t.strip
      : a.kind === "original"
        ? t.photoN(a.idx)
        : a.kind === "animation"
          ? t.animation
          : t.video;
  const [busy, setBusy] = useState(false);
  // iPhone: share sheet ditolak karena menunggu unduhan → ketukan berikutnya langsung membuka (file sudah siap).
  const [retry, setRetry] = useState<GuestAsset[] | null>(null);
  const [view, setView] = useState<number | null>(null);
  const toast = useToast();

  // iPhone: ambil semua file di latar setelah halaman tampil supaya share sheet tidak ditolak (lihat save.ts).
  // biome-ignore lint/correctness/useExhaustiveDependencies: sekali per sesi; daftar aset tetap
  useEffect(() => {
    if (!isApple()) return;
    const timer = setTimeout(() => {
      for (const a of items) prefetch(a).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [sessionId]);

  const run = async (list: GuestAsset[], all: boolean) => {
    if (busy || !list.length) return;
    track(sessionId, all ? "save_all" : "save");
    setBusy(true);
    const r = await saveToPhone(list, eventName, sessionId);
    setBusy(false);
    setRetry(r === "retry" ? list : null);
    if (r === "retry") toast.show(t.tapAgain);
    else if (r === "saved") toast.show(t.saved);
  };
  const tile =
    "pressable relative block w-full overflow-hidden rounded-xl border-[1.5px] border-ink bg-neutral";
  const chip =
    "absolute bottom-2 left-2 rounded-full border-[1.5px] border-ink bg-paper px-2 py-0.5 text-[11px] font-bold";
  const open = (a: GuestAsset) => setView(items.indexOf(a));
  const cur = view === null ? undefined : items[view];

  return (
    <>
      <div className="flex flex-1 flex-col px-4 pt-4 pb-6">
        {strip && (
          <button
            type="button"
            aria-label={t.strip}
            onClick={() => open(strip)}
            style={{ "--d": "150ms" } as CSSProperties}
            className="animate-rise pressable mx-auto block"
          >
            <img
              src={strip.url}
              alt=""
              fetchPriority="high"
              // Muat satu layar bersama header ringkas + tombol simpan: strip tidak tertutup tombol.
              className="layered block max-h-[calc(100svh-16rem)] w-auto max-w-full rounded-lg border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px] [--under:#fff]"
            />
          </button>
        )}
        {items.length > 0 && (
          <p className="mt-4 mb-3 text-center font-mono text-[11px] text-text-2">{t.tapHint}</p>
        )}
        {rest.length > 0 && (
          // Dua kolom berjenjang: foto landscape & portrait tampil utuh tanpa celah besar.
          <div className="columns-2 gap-2.5">
            {rest.map((a, i) => (
              <button
                key={`${a.kind}-${a.idx}`}
                type="button"
                aria-label={label(a)}
                onClick={() => open(a)}
                style={{ "--d": `${200 + Math.min(i, 8) * 60}ms` } as CSSProperties}
                className={`animate-rise mb-2.5 break-inside-avoid ${tile}`}
              >
                {a.kind === "video" ? (
                  <video
                    src={a.url}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="block h-auto w-full"
                  />
                ) : (
                  <img
                    src={a.kind === "original" ? thumbOf(a) : a.url}
                    alt=""
                    loading={i < 4 ? "eager" : "lazy"}
                    className="block h-auto w-full"
                  />
                )}
                <span className={chip}>{label(a)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 border-t-[1.5px] border-ink bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="relative flex gap-2.5">
          {toast.node}
          <button
            type="button"
            disabled={busy || !items.length}
            onClick={() => run(retry ?? items, !retry || retry.length > 1)}
            className="pressable layered h-12 flex-1 rounded-[14px] border-[1.5px] border-ink bg-butter px-4 text-[15px] font-extrabold [--lb:1.5px] [--lx:3px] disabled:opacity-40"
          >
            {busy ? t.saving : retry ? t.tapAgain : t.saveEverything(items.length)}
          </button>
          <button
            type="button"
            aria-label={t.share}
            onClick={() => shareLink(eventName, toast.show)}
            className="pressable layered flex size-12 flex-none items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:3px]"
          >
            <Share2 size={18} strokeWidth={2.5} />
          </button>
        </div>
        {expiresAt && (
          <p className="mt-2 text-center text-[11px] text-text-2">
            {t.availableUntil}{" "}
            <span className="font-mono" data-expires>
              {expiresAt}
            </span>
          </p>
        )}
      </footer>

      {cur && view !== null && (
        <PhotoViewer
          items={items.map((a) => ({
            src: a.url,
            thumb: a.kind === "original" ? thumbOf(a) : a.url,
            video: a.kind === "video",
          }))}
          index={view}
          onIndex={setView}
          onClose={() => setView(null)}
        >
          <button
            type="button"
            disabled={busy}
            onClick={() => run([cur], false)}
            className="pressable h-11 rounded-[14px] border-[1.5px] border-ink bg-butter px-3 text-[14px] font-extrabold disabled:opacity-40"
          >
            {busy ? t.saving : t.saveThis(cur.kind)}
          </button>
        </PhotoViewer>
      )}
    </>
  );
}
