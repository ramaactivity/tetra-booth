"use client";
import type { GuestMe, LayoutSpec } from "@tetra/shared";
import { Download, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { renderStrip } from "@/app/c/[token]/strip";
import { PROMO_SAVED } from "@/components/GuestPromo";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { longDateId, Primary, Secondary, TopBar } from "./ui";

const t = copy.guestCam;

/** Gambar mini tata letak frame: kertas + kotak slot foto, sesuai rasio aslinya. */
function Mini({ layout, on }: { layout: LayoutSpec; on: boolean }) {
  const { width: w, height: h } = layout.canvas;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-full max-w-full" aria-hidden>
      <rect width={w} height={h} rx={w * 0.04} fill={layout.background?.color ?? "#F8F7F4"} />
      {layout.slots.map((s) => (
        <rect
          key={s.id}
          x={s.x}
          y={s.y}
          width={s.w}
          height={s.h}
          rx={w * 0.015}
          fill={on ? "#1D1D1B" : "#8A8883"}
        />
      ))}
    </svg>
  );
}

/**
 * Photo frame (#209/#212/#213): kartu frame bergambar tata letak (desain booth event dulu, lalu Strip 2R / 4R /
 * Polaroid Tetra), pratinjau frame di tengah yang berubah tiap foto dipilih, baki foto di bawah (urutan = urutan
 * tap). "Print" = render penuh + animasi keluar dari slot printer → save ke HP / kirim ke album. Render lewat
 * template engine yang sama dengan booth.
 */
export function StripPicker({
  info,
  me,
  k,
  onSend,
  onClose,
}: {
  info: GuestInfo;
  me: GuestMe;
  k: number;
  onSend: (shot: { main: Blob; thumb: Blob }) => Promise<void>;
  onClose: () => void;
}) {
  const fits = info.designs.filter((d) => d.layout.slots.length <= me.photos.length);
  const [designId, setDesignId] = useState(fits[0]?.id);
  const design = fits.find((d) => d.id === designId);
  const n = design?.layout.slots.length ?? 0;
  const [picked, setPicked] = useState<number[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [made, setMade] = useState<{ main: Blob; thumb: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const vars = { event_name: info.name, date: longDateId(info.date) };
  const qr = typeof location === "undefined" ? "" : location.origin + info.link;
  const urls = () =>
    Array.from({ length: n }, (_, i) => me.photos.find((p) => p.idx === picked[i])?.url ?? null);

  // Pratinjau (skala 0,6, cukup tajam di layar retina) tiap pilihan berubah; render lama yang telat dibuang.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dirender ulang hanya saat pilihan berubah
  useEffect(() => {
    if (!design || made) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await renderStrip(design, urls(), vars, qr, 0.6).catch(() => null);
      if (r && id === seq.current) {
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(r.main);
        });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [picked, made, designId]);

  if (!design) return null;
  const full = picked.length >= n;
  const ratio = `${design.layout.canvas.width}/${design.layout.canvas.height}`;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black text-paper">
      <div className="flex-none px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <TopBar
          onBack={made ? () => setMade(null) : onClose}
          title={made ? t.yourStrip : t.frameTitle}
          sub={t.stripOf(k)}
        />
      </div>

      {!made && info.designs.length > 1 && (
        <ul className="mt-2 flex flex-none gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {info.designs.map((d) => {
            const need = d.layout.slots.length;
            const on = d.id === designId;
            return (
              <li key={d.id} className="flex-none">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={`${d.name}, ${t.photos(need)}`}
                  disabled={need > me.photos.length}
                  onClick={() => {
                    setDesignId(d.id);
                    setPicked((s) => s.slice(0, need));
                  }}
                  className={`relative flex w-[92px] flex-col items-center gap-1.5 rounded-2xl p-2 pb-2.5 transition active:scale-95 disabled:opacity-35 ${on ? "bg-paper text-ink" : "bg-white/10"}`}
                >
                  <span className="flex h-[58px] items-center justify-center">
                    <Mini layout={d.layout} on={on} />
                  </span>
                  <span className="w-full truncate text-center text-xs leading-tight font-extrabold">
                    {d.name}
                  </span>
                  <span className="-mt-1 font-mono text-[10px] opacity-60">
                    {need > me.photos.length ? t.needMore(need) : t.photos(need)}
                  </span>
                  {d.booth && (
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-butter px-1.5 py-px text-[9px] font-extrabold text-ink">
                      {t.boothTag}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Pratinjau / hasil print */}
      <div className="relative flex min-h-0 flex-1 flex-col items-center px-6 pt-4 pb-4">
        {made && (
          <div className="z-10 h-3 w-[78%] flex-none rounded-full bg-white/15 shadow-[inset_0_2px_4px_rgba(0,0,0,.6)]" />
        )}
        <div
          className={`flex min-h-0 w-full flex-1 justify-center ${made ? "-mt-1.5 overflow-hidden pt-1.5" : "items-center"}`}
        >
          {made ? (
            // biome-ignore lint/performance/noImgElement: object URL hasil render lokal
            <img
              src={made.url}
              alt={t.yourStrip}
              className="max-h-full max-w-full self-start rounded-[3px] shadow-[0_18px_40px_rgba(0,0,0,.6)] motion-safe:animate-[strip-out_1.4s_cubic-bezier(.2,.7,.2,1)_both]"
            />
          ) : preview ? (
            // biome-ignore lint/performance/noImgElement: object URL hasil render lokal
            <img
              src={preview}
              alt={t.previewAlt}
              className="max-h-full max-w-full rounded-[3px] shadow-[0_18px_40px_rgba(0,0,0,.6)]"
            />
          ) : (
            <div
              className="h-full max-h-full max-w-full animate-pulse rounded-[3px] bg-white/10"
              style={{ aspectRatio: ratio }}
            />
          )}
        </div>
      </div>

      {/* Baki */}
      <div className="flex-none rounded-t-[28px] bg-[#151514] px-4 pt-4 pb-[max(18px,env(safe-area-inset-bottom))]">
        {made ? (
          <>
            <p className="mb-3 text-center text-sm text-paper/70">{t.madeBody}</p>
            <div className="grid grid-cols-2 gap-3">
              <Secondary
                className="px-3"
                onClick={async () => {
                  const file = new File([made.main], `frame-${k}.jpg`, { type: "image/jpeg" });
                  const saved = () => window.dispatchEvent(new Event(PROMO_SAVED));
                  if (navigator.canShare?.({ files: [file] }))
                    return void (await navigator.share({ files: [file] }).then(saved, () => {}));
                  saved();
                  const a = document.createElement("a");
                  a.href = made.url;
                  a.download = file.name;
                  a.click();
                }}
              >
                <Download size={18} /> {t.saveHp}
              </Secondary>
              <Primary
                className="px-3"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onSend(made);
                }}
              >
                <Send size={18} /> {t.sendAlbum}
              </Primary>
            </div>
          </>
        ) : (
          <>
            <div className="flex h-8 items-center justify-between">
              <span className="text-sm font-bold">
                {full ? t.pickDone : t.pickLeft(n - picked.length)}
              </span>
              {picked.length > 0 && (
                <button
                  type="button"
                  onClick={() => setPicked([])}
                  className="flex h-8 items-center gap-1.5 rounded-full bg-white/10 px-3 text-xs font-bold"
                >
                  <RotateCcw size={14} /> {t.reset}
                </button>
              )}
            </div>
            <ul className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {me.photos.map((p) => {
                const at = picked.indexOf(p.idx);
                const off = at < 0 && full;
                return (
                  <li key={p.idx} className="flex-none">
                    <button
                      type="button"
                      aria-pressed={at >= 0}
                      aria-label={at >= 0 ? t.photoNo(at + 1) : t.pickPhoto}
                      disabled={off}
                      onClick={() =>
                        setPicked((s) =>
                          s.includes(p.idx)
                            ? s.filter((x) => x !== p.idx)
                            : s.length < n
                              ? [...s, p.idx]
                              : s,
                        )
                      }
                      className={`relative block h-[100px] w-[75px] overflow-hidden rounded-xl bg-white/10 transition active:scale-95 disabled:opacity-30 ${at >= 0 ? "ring-[3px] ring-butter ring-inset" : ""}`}
                    >
                      {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
                      <img src={p.thumbUrl ?? p.url} alt="" className="size-full object-cover" />
                      {at >= 0 && (
                        <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-butter font-mono text-xs font-bold text-ink">
                          {at + 1}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Primary
              className="mt-3.5"
              disabled={!full || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await renderStrip(design, urls(), vars, qr);
                  setMade({ ...r, url: URL.createObjectURL(r.main) });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? t.making : t.seeStrip}
            </Primary>
          </>
        )}
      </div>
    </main>
  );
}
