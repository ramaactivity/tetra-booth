"use client";
import type { GuestMe, LayoutPaper } from "@tetra/shared";
import { ChevronLeft, Download, Printer, RotateCcw, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type Crop, renderStrip } from "@/app/c/[token]/strip";
import { PROMO_SAVED } from "@/components/GuestPromo";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { NO_CROP, SlotCrop } from "./SlotCrop";
import { longDateId, Primary, Secondary, TopBar } from "./ui";

const t = copy.guestCam;
const SIZES: LayoutPaper[] = ["2x6x2", "4R", "3x4x2"];
type Design = GuestInfo["designs"][number];

/** Pratinjau berulang: render terakhir menang, URL lama dibuang. */
function useRender(key: string, run: () => Promise<Blob | null>) {
  const [url, setUrl] = useState<string | null>(null);
  const seq = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: dirender ulang hanya saat `key` berubah
  useEffect(() => {
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const b = await run().catch(() => null);
      if (b && id === seq.current)
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(b);
        });
    }, 100);
    return () => clearTimeout(timer);
  }, [key]);
  return url;
}

/**
 * Bikin frame (#229, desain Snapbook): pilih ukuran (Strip 2R / 4R / Polaroid, menentukan jumlah foto) → geser antar
 * gaya; pratinjau besar langsung memakai foto tamu (otomatis diisi, bisa diatur di langkah foto). Frame acara
 * (desain booth) jadi gaya pertama di ukurannya, lalu 15 gaya Snapbook. "Print" = render penuh + animasi keluar dari
 * slot printer → save ke HP / kirim ke album. Render lewat template engine yang sama dengan booth.
 */
export function StripPicker({
  info,
  me,
  k,
  onSend,
  onPrint,
  onClose,
}: {
  info: GuestInfo;
  me: GuestMe;
  k: number;
  onSend: (shot: { main: Blob; thumb: Blob }) => Promise<void>;
  /** Cetak di booth (#223): ada kalau add-on aktif dan tamu belum pernah mencetak. */
  onPrint?: ((shot: { main: Blob; thumb: Blob }, designId: string) => Promise<void>) | undefined;
  onClose: () => void;
}) {
  const sizes = SIZES.filter((s) => info.designs.some((d) => d.layout.paper === s));
  const [size, setSize] = useState<LayoutPaper>(
    info.designs.find((d) => d.booth)?.layout.paper ?? sizes[0] ?? "2x6x2",
  );
  const group = info.designs.filter((d) => d.layout.paper === size);
  const [chosen, setChosen] = useState<Partial<Record<LayoutPaper, string>>>({});
  const design = group.find((d) => d.id === chosen[size]) ?? group[0];
  const n = design?.layout.slots.length ?? 0;
  const all = me.photos.map((p) => p.idx);
  const fill = (s: number[], need: number) =>
    [...s, ...all.filter((i) => !s.includes(i))].slice(0, need);
  const [picked, setPicked] = useState<number[]>(() => fill([], n));
  const [step, setStep] = useState<"frame" | "photos">("frame");
  const [made, setMade] = useState<{ main: Blob; thumb: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const x0 = useRef(0);
  const vars = { event_name: info.name, date: longDateId(info.date) };
  const qr = typeof location === "undefined" ? "" : location.origin + info.link;
  // Pratinjau & thumbnail pakai foto kecil (hemat memori/sinyal iPhone); hasil akhir foto penuh, cadangan thumbnail.
  const urls = (d: Design, ids = picked, full = false) =>
    d.layout.slots.map((_, i) => {
      const p = me.photos.find((x) => x.idx === ids[i]);
      if (!p) return null;
      const small = p.thumbUrl ?? p.url;
      return full ? [p.url, small] : [small, p.url];
    });
  // Atur foto per slot (#247), kunci = desain:slot:foto supaya ganti foto = mulai dari tengah lagi.
  const [crops, setCrops] = useState<Record<string, Crop>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const cropKey = (d: Design, i: number) => `${d.id}:${i}:${picked[i]}`;
  const cropsOf = (d: Design) => d.layout.slots.map((_, i) => crops[cropKey(d, i)]);
  const preview = useRender(
    `${design?.id}|${picked.join()}|${!!made}|${JSON.stringify(design ? cropsOf(design) : [])}`,
    async () =>
      design && !made
        ? (await renderStrip(design, urls(design), vars, qr, 0.6, cropsOf(design))).main
        : null,
  );

  const choose = (d: Design) => {
    setChosen((c) => ({ ...c, [size]: d.id }));
    setPicked((s) => fill(s, d.layout.slots.length));
  };
  const pickSize = (s: LayoutPaper) => {
    setSize(s);
    const d =
      info.designs.find((x) => x.id === chosen[s]) ??
      info.designs.find((x) => x.layout.paper === s);
    if (d) setPicked((p) => fill(p, d.layout.slots.length));
  };
  const make = async () => {
    if (!design) return;
    setBusy(true);
    try {
      const r = await renderStrip(design, urls(design, picked, true), vars, qr, 1, cropsOf(design));
      setMade({ ...r, url: URL.createObjectURL(r.main) });
    } finally {
      setBusy(false);
    }
  };

  if (!design) return null;
  const at = group.indexOf(design);
  const lack = Math.max(0, n - me.photos.length);
  const full = picked.length >= n;
  const ratio = `${design.layout.canvas.width}/${design.layout.canvas.height}`;

  if (step === "frame" && !made) {
    return (
      <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-paper text-ink">
        <header className="flex flex-none items-center justify-between px-5 pt-[max(12px,env(safe-area-inset-top))] pb-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              aria-label={t.back}
              className="flex size-10 flex-none items-center justify-center rounded-xl border-[1.5px] border-ink bg-white active:translate-x-px active:translate-y-px"
            >
              <ChevronLeft size={20} strokeWidth={2.5} />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold tracking-[-0.02em]">{t.makeFrame}</h1>
              <p className="truncate font-mono text-xs text-text-2">
                {t.frameUsed(n, me.photos.length)}
              </p>
            </div>
          </div>
          <span className="flex-none rounded-full border-[1.5px] border-ink bg-mint-soft px-2.5 py-[7px] font-mono text-xs leading-none font-medium">
            {t.photos(me.photos.length)}
          </span>
        </header>

        <div
          role="tablist"
          className="mx-5 grid flex-none overflow-hidden rounded-[14px] border-[1.5px] border-ink bg-white"
          style={{ gridTemplateColumns: `repeat(${sizes.length},1fr)` }}
        >
          {sizes.map((s, i) => {
            const counts = info.designs
              .filter((d) => d.layout.paper === s)
              .map((d) => d.layout.slots.length);
            const lo = Math.min(...counts);
            const hi = Math.max(...counts);
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={s === size}
                onClick={() => pickSize(s)}
                className={`px-1 pt-[9px] pb-2 text-center ${s === size ? "bg-lavender" : ""} ${i ? "border-l-[1.5px] border-ink" : ""}`}
              >
                <span className="block text-sm font-extrabold">{t.sizes[s]}</span>
                <span className="block font-mono text-[11px] leading-[1.3] text-text-3">
                  {lo === hi ? t.photos(lo) : `${lo}–${hi} foto`}
                </span>
              </button>
            );
          })}
        </div>

        <div
          className="flex min-h-0 flex-1 items-center justify-center px-8 pt-4 pb-3"
          onTouchStart={(e) => {
            x0.current = e.touches[0]?.clientX ?? 0;
          }}
          onTouchEnd={(e) => {
            const dx = (e.changedTouches[0]?.clientX ?? 0) - x0.current;
            const next = group[at + (dx < 0 ? 1 : -1)];
            if (Math.abs(dx) > 48 && next) choose(next);
          }}
        >
          <div
            className="relative max-h-full max-w-full"
            style={{ aspectRatio: ratio, height: "100%" }}
          >
            <div className="absolute inset-0 translate-x-2 translate-y-2 rounded-[4px] border-[1.5px] border-ink bg-white" />
            <div className="relative size-full overflow-hidden rounded-[4px] border-[1.5px] border-ink bg-white">
              {preview ? (
                // biome-ignore lint/performance/noImgElement: object URL hasil render lokal
                <img src={preview} alt={t.previewAlt} className="block size-full" />
              ) : (
                <div className="stripes size-full animate-pulse" />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-none items-baseline justify-between px-5 pt-1.5">
          <p className="truncate text-[15px] font-extrabold tracking-[-0.02em]">
            {design.booth ? t.eventStyle : design.name}
          </p>
          <p className="flex-none pl-3 font-mono text-xs text-text-2">
            {t.styleAt(at + 1, group.length, n)}
          </p>
        </div>
        <Thumbs
          key={size}
          group={group}
          on={design.id}
          urls={(d) => urls(d, fill(picked, d.layout.slots.length))}
          vars={vars}
          qr={qr}
          onPick={choose}
        />

        <div className="flex flex-none flex-col gap-2 border-t-[1.5px] border-dashed border-ink px-5 pt-3.5 pb-[max(22px,env(safe-area-inset-bottom))]">
          <div className="relative">
            <div className="absolute inset-0 translate-x-[5px] translate-y-[5px] rounded-[14px] border-[1.5px] border-ink bg-paper" />
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                lack ? onClose() : me.photos.length > n ? setStep("photos") : void make()
              }
              className="relative flex h-14 w-full items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-butter text-base font-extrabold transition-transform active:translate-x-[5px] active:translate-y-[5px]"
            >
              {busy ? t.making : lack ? t.shootMore(lack) : t.useFrame}
            </button>
          </div>
          {onPrint && design.printable && !lack && (
            <p className="text-center text-xs text-text-2">{t.printHint}</p>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black text-paper">
      <div className="flex-none px-4 pt-[max(12px,env(safe-area-inset-top))]">
        <TopBar
          onBack={made ? () => setMade(null) : () => setStep("frame")}
          title={made ? t.yourStrip : design.name}
          sub={t.stripOf(k)}
        />
      </div>

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
            // Area tiap slot bisa diketuk untuk atur foto (geser / zoom), #247.
            <div className="flex size-full items-center justify-center [container-type:size]">
              <div
                className="relative"
                style={{
                  width: `min(100cqw, ${(design.layout.canvas.width / design.layout.canvas.height) * 100}cqh)`,
                  aspectRatio: ratio,
                }}
              >
                {/* biome-ignore lint/performance/noImgElement: object URL hasil render lokal */}
                <img
                  src={preview}
                  alt={t.previewAlt}
                  className="size-full rounded-[3px] shadow-[0_18px_40px_rgba(0,0,0,.6)]"
                />
                {design.layout.slots.map((s, i) =>
                  picked[i] === undefined ? null : (
                    <button
                      key={s.id}
                      type="button"
                      aria-label={t.cropSlot(i + 1)}
                      onClick={() => setEditing(i)}
                      className="absolute rounded-[2px] transition active:bg-white/20"
                      style={{
                        left: `${(s.x / design.layout.canvas.width) * 100}%`,
                        top: `${(s.y / design.layout.canvas.height) * 100}%`,
                        width: `${(s.w / design.layout.canvas.width) * 100}%`,
                        height: `${(s.h / design.layout.canvas.height) * 100}%`,
                      }}
                    />
                  ),
                )}
              </div>
            </div>
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
            {onPrint && design.printable && (
              <Primary
                className="mb-3"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await onPrint(made, design.id);
                }}
              >
                <Printer size={18} /> {busy ? t.printSending : t.printBooth}
              </Primary>
            )}
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
                {full ? t.pickDoneCrop : t.pickLeft(n - picked.length)}
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
            <Primary className="mt-3.5" disabled={!full || busy} onClick={make}>
              {busy ? t.making : t.seeStrip}
            </Primary>
          </>
        )}
      </div>
      {editing !== null &&
        (() => {
          const s = design.layout.slots[editing];
          const p = me.photos.find((x) => x.idx === picked[editing]);
          if (!s || !p) return null;
          return (
            <SlotCrop
              src={p.thumbUrl ?? p.url}
              ratio={s.w / s.h}
              value={crops[cropKey(design, editing)] ?? NO_CROP}
              onClose={() => setEditing(null)}
              onDone={(c) => {
                setCrops((m) => ({ ...m, [cropKey(design, editing)]: c }));
                setEditing(null);
              }}
            />
          );
        })()}
    </main>
  );
}

/** Deretan gaya satu ukuran: thumbnail dirender kecil dengan foto tamu, berurutan supaya HP tidak tersendat. */
function Thumbs({
  group,
  on,
  urls,
  vars,
  qr,
  onPick,
}: {
  group: Design[];
  on: string;
  urls: (d: Design) => (readonly string[] | null)[];
  vars: { event_name: string; date: string };
  qr: string;
  onPick: (d: Design) => void;
}) {
  const [img, setImg] = useState<Record<string, string>>({});
  const list = useRef<HTMLUListElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sekali per ukuran (komponen di-key per ukuran)
  useEffect(() => {
    let stop = false;
    const made: string[] = [];
    (async () => {
      for (const d of group) {
        if (stop) break;
        const r = await renderStrip(d, urls(d), vars, qr, 160 / d.layout.canvas.height).catch(
          () => null,
        );
        if (!r || stop) continue;
        const u = URL.createObjectURL(r.main);
        made.push(u);
        setImg((m) => ({ ...m, [d.id]: u }));
      }
    })();
    return () => {
      stop = true;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, []);
  useEffect(() => {
    list.current
      ?.querySelector(`[data-id="${on}"]`)
      ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [on]);
  return (
    <ul
      ref={list}
      className="flex flex-none gap-2.5 overflow-x-auto px-5 pt-2.5 pb-3.5 [scrollbar-width:none]"
    >
      {group.map((d) => {
        const sel = d.id === on;
        return (
          <li key={d.id} data-id={d.id} className="flex-none">
            <button
              type="button"
              aria-pressed={sel}
              aria-label={d.name}
              onClick={() => onPick(d)}
              className={`flex h-24 w-[68px] items-center justify-center rounded-xl ${sel ? "border-2 border-ink bg-mint-soft shadow-[4px_4px_0_var(--ink)]" : "border-[1.5px] border-line-soft bg-white"}`}
            >
              {img[d.id] ? (
                // biome-ignore lint/performance/noImgElement: object URL hasil render lokal
                <img
                  src={img[d.id]}
                  alt=""
                  className="max-h-[78px] max-w-[56px] border border-line-soft"
                />
              ) : (
                <span
                  className="stripes block h-[78px] max-w-[56px] border border-line-soft"
                  style={{ aspectRatio: `${d.layout.canvas.width}/${d.layout.canvas.height}` }}
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
