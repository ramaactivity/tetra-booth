import { Button } from "@tetra/ui";
import { ArrowRight, Focus, Maximize2, RotateCcw, X } from "lucide-react";
import { type CSSProperties, useState } from "react";
import { copy } from "../copy";
import type { Photo } from "../session";
import { Logo } from "../ui";

export function Review({
  photos,
  blurry = [],
  aspects = [],
  retakesUsed,
  retakeMax,
  onRetake,
  onNext,
  onZoom,
}: {
  photos: (Photo | null)[];
  /** Foto yang mungkin buram (#88): lencana + tombol Ulangi disorot, tidak pernah mengunci. */
  blurry?: boolean[];
  /** Rasio lebar/tinggi slot tiap foto: kartu menampilkan potongan yang sama dengan cetakan (#110). */
  aspects?: (number | undefined)[];
  retakesUsed: number[];
  retakeMax: number;
  onRetake: (index: number) => void;
  onNext: () => void;
  /** Foto diperbesar dibuka/ditutup: SessionRunner menahan timer cek foto selama terbuka. */
  onZoom?: (open: boolean) => void;
}) {
  // Ketuk foto → tampil besar (Rama 14 Okt: 3 foto kecil susah dilihat klien), potongan sama dengan cetakan.
  const [zoom, setZoom] = useState<number | null>(null);
  const open = (i: number) => {
    setZoom(i);
    onZoom?.(true);
  };
  const close = () => {
    setZoom(null);
    onZoom?.(false);
  };
  const big = zoom === null ? null : photos[zoom];
  return (
    <main className="flex h-full w-full flex-col bg-paper px-24 py-16 portrait:px-12">
      <div className="flex h-[62px] items-center">
        <Logo />
      </div>
      <div className="mt-9 flex items-end justify-between gap-8 portrait:flex-col portrait:items-start">
        <h1 className="text-[72px] font-extrabold tracking-[-0.035em]">{copy.review.title}</h1>
        {retakeMax > 0 && (
          <p className="flex items-center gap-2 rounded-[18px] border-2 border-dashed border-ink bg-sky px-6 py-4 text-2xl font-semibold whitespace-nowrap">
            <RotateCcw size={22} strokeWidth={2.5} />
            {copy.review.rule(retakeMax)}
          </p>
        )}
      </div>
      {/* Tiap sel = container ukuran; kartu 3:2 + tombol Ulangi (92 px + jarak 26 px) selalu muat di lebar
          maupun tinggi sel, berapa pun jumlah foto (1 foto dulu meluap ke bawah dan menutupi tombol). */}
      <div
        style={{ "--n": photos.length } as CSSProperties}
        className="grid min-h-0 flex-1 auto-rows-[minmax(0,1fr)] grid-cols-[repeat(var(--n),minmax(0,1fr))] gap-10 py-8 portrait:grid-cols-2"
      >
        {photos.map((p, i) => {
          const used = retakesUsed[i] ?? 0;
          const a = aspects[i] ?? 1.5;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: urutan slot tetap
            <div key={i} className="flex min-h-0 items-center justify-center [container-type:size]">
              <div
                style={{ width: `min(100cqw, calc((100cqh - 118px) * ${a}))` }}
                className="flex flex-col gap-[26px]"
              >
                <button
                  type="button"
                  aria-label={copy.review.zoom(i + 1)}
                  disabled={!p}
                  onClick={() => open(i)}
                  style={{ aspectRatio: a }}
                  className="layered relative block w-full cursor-zoom-in overflow-hidden rounded-[20px] border-[2.5px] border-ink bg-neutral p-0 text-left [--under:#fff]"
                >
                  {p && <img src={p.url} alt="" className="h-full w-full object-cover" />}
                  <span className="absolute top-3.5 left-3.5 flex size-[46px] items-center justify-center rounded-full border-2 border-ink bg-white text-xl font-extrabold">
                    {i + 1}
                  </span>
                  {blurry[i] && (
                    <span
                      data-testid="blurry-badge"
                      className="absolute top-3.5 right-3.5 flex items-center gap-2 rounded-full border-2 border-ink bg-peach px-4 py-1.5 text-xl font-bold"
                    >
                      <Focus size={20} strokeWidth={2.5} />
                      {copy.review.blurry}
                    </span>
                  )}
                  {p && (
                    <span className="absolute right-3.5 bottom-3.5 flex size-[46px] items-center justify-center rounded-full border-2 border-ink bg-white">
                      <Maximize2 size={22} strokeWidth={2.5} />
                    </span>
                  )}
                </button>
                {used < retakeMax ? (
                  <Button
                    variant={blurry[i] ? "primary" : "plain"}
                    className={`h-[92px] rounded-[22px] text-[26px] ${blurry[i] ? "" : "bg-white!"}`}
                    onClick={() => onRetake(i)}
                  >
                    <RotateCcw size={24} strokeWidth={2.5} />
                    {copy.review.retake}
                  </Button>
                ) : (
                  used > 0 && (
                    <div className="flex h-[92px] items-center justify-center rounded-[22px] border-[2.5px] border-dashed border-[#9a9892] text-2xl font-bold text-[#7a7873]">
                      {copy.review.retaken(used, retakeMax)}
                    </div>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button className="h-[108px] w-[520px] rounded-3xl text-[32px]" onClick={onNext}>
          {copy.review.next}
          <ArrowRight size={32} strokeWidth={2.5} />
        </Button>
      </div>
      {big && zoom !== null && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-12">
          <button
            type="button"
            aria-label={copy.review.back}
            className="absolute inset-0 bg-ink/85"
            onClick={close}
          />
          <div
            style={{
              aspectRatio: aspects[zoom] ?? 1.5,
              width: `min(92vw, calc(84vh * ${aspects[zoom] ?? 1.5}))`,
            }}
            className="pointer-events-none relative overflow-hidden rounded-[20px] border-[2.5px] border-white"
          >
            <img src={big.url} alt="" className="h-full w-full object-cover" />
          </div>
          <Button
            variant="plain"
            className="absolute top-10 right-10 h-[88px] rounded-[22px] bg-white! px-8 text-[28px]"
            onClick={close}
          >
            <X size={28} strokeWidth={2.5} />
            {copy.review.close}
          </Button>
        </div>
      )}
    </main>
  );
}
