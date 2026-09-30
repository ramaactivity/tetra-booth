import type { EventDesign } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { rupiahShort } from "../format";
import { Done, Logo } from "../ui";

/** Tamu pergi tanpa memilih → kembali ke attract. */
export const LAYOUT_IDLE_MS = 60_000;
const t = copy.photobox;

/** Stepper photobox (A2): Layout · Bayar · Foto · Cetak. */
export function PhotoboxSteps({ current }: { current: number }) {
  return (
    <div className="flex items-start">
      {t.steps.map((label, i) => (
        <div key={label} className="flex items-start">
          {i > 0 && <span className="mt-[22px] w-[88px] border-t-[3px] border-dashed border-ink" />}
          <div className="flex w-[88px] flex-col items-center gap-2 text-[18px] font-semibold">
            {i < current ? (
              <Done size={44} />
            ) : (
              <span
                className={`flex size-11 items-center justify-center rounded-full border-2 border-ink text-lg font-bold ${i === current ? "bg-ink text-white" : "bg-white"}`}
              >
                {i + 1}
              </span>
            )}
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Kotak maksimum pratinjau: sebesar mungkin supaya tamu bisa melihat desainnya (Rama 2026-09-30). */
const PREVIEW_W = 440;
const PREVIEW_H = 440;

/** Miniatur layout: kertas dengan slot bergaris sesuai spesifikasi layout (belum ada pratinjau asli). */
function Mini({ layout }: { layout: EventDesign["layout"] }) {
  const { width, height } = layout.canvas;
  const scale = Math.min(PREVIEW_W / width, PREVIEW_H / height);
  return (
    <div
      style={{ width: width * scale, height: height * scale }}
      className="relative bg-white shadow-[0_18px_40px_-18px_rgba(29,29,27,0.45)] ring-2 ring-ink"
    >
      {layout.slots.map((s) => (
        <div
          key={s.id}
          className="stripes absolute"
          style={{ left: s.x * scale, top: s.y * scale, width: s.w * scale, height: s.h * scale }}
        />
      ))}
    </div>
  );
}

/**
 * Pilih layout photobox (desain v2 A2), atau pilih desain di mode event (DECISIONS #99): tanpa harga & stepper,
 * kartu memakai pratinjau desain asli (`preview`) bila ada.
 * Tata letak: kartu di tengah dengan pratinjau besar seperti kertas cetak; kartu terpilih terangkat & bertanda,
 * yang lain meredup; tombol menyebut desain terpilih. Lebih dari 3 pilihan = baris geser horizontal.
 */
export function LayoutSelect({
  layouts,
  onChoose,
  onBack,
  preview,
  design = false,
}: {
  layouts: (EventDesign & { price?: number })[];
  onChoose: (id: string) => void;
  onBack: () => void;
  /** Object URL pratinjau asli per id layout/desain (#99/#108); belum ada = miniatur slot. */
  preview?: Record<string, string>;
  /** Mode event: judul "Pilih desain", tanpa stepper & harga, tombol "Mulai Foto". */
  design?: boolean;
}) {
  const [picked, setPicked] = useState(layouts.length === 1 ? (layouts[0]?.id ?? null) : null);
  const back = useRef(onBack);
  back.current = onBack;
  // biome-ignore lint/correctness/useExhaustiveDependencies: tiap pilihan tamu me-reset timer diam
  useEffect(() => {
    const id = setTimeout(() => back.current(), LAYOUT_IDLE_MS);
    return () => clearTimeout(id);
  }, [picked]);
  const chosen = layouts.find((l) => l.id === picked);
  const many = layouts.length > 3;
  return (
    <main className="flex h-full w-full flex-col gap-6 bg-paper px-[100px] py-12 portrait:px-12">
      <header className="flex items-center justify-between">
        <Logo />
        {!design && <PhotoboxSteps current={0} />}
        <span className="w-[180px]" />
      </header>
      <div className="flex flex-col gap-3 text-center">
        <h1 className="text-[72px] leading-none font-extrabold tracking-[-0.045em]">
          {design ? copy.design.chooseTitle : t.chooseTitle}
        </h1>
        <p className="text-[28px] font-medium text-text-2">{picked ? t.pickedHint : t.pickHint}</p>
      </div>
      <div
        className={`flex min-h-0 flex-1 items-center gap-12 px-4 py-4 ${many ? "snap-x overflow-x-auto" : "justify-center"} portrait:flex-wrap portrait:justify-center portrait:overflow-y-auto`}
      >
        {layouts.map((l) => {
          const on = picked === l.id;
          const dim = picked !== null && !on;
          return (
            <button
              key={l.id}
              type="button"
              data-testid="layout-card"
              aria-pressed={on}
              onClick={() => setPicked(l.id)}
              style={{ ["--under" as string]: on ? "var(--mint)" : "#fff" }}
              className={`pressable layered relative flex shrink-0 snap-center flex-col items-center gap-6 rounded-[32px] border-ink px-8 pt-8 pb-6 transition-[transform,opacity] duration-200 [--lx:10px] ${on ? "-translate-y-2 border-[4px] bg-mint-soft" : "border-[2.5px] bg-white"} ${dim ? "opacity-55" : ""}`}
            >
              {on && <Done size={60} className="absolute -top-5 -right-5" />}
              <div
                className="flex items-center justify-center"
                style={{ width: PREVIEW_W, height: PREVIEW_H }}
              >
                {preview?.[l.id] ? (
                  <img
                    src={preview[l.id]}
                    alt=""
                    style={{ maxWidth: PREVIEW_W, maxHeight: PREVIEW_H }}
                    className="bg-white object-contain shadow-[0_18px_40px_-18px_rgba(29,29,27,0.45)] ring-2 ring-ink"
                  />
                ) : (
                  <Mini layout={l.layout} />
                )}
              </div>
              <div className="flex w-full max-w-[440px] items-end justify-between gap-4 text-left">
                <div className="min-w-0">
                  <div className="line-clamp-2 text-[32px] leading-tight font-extrabold tracking-[-0.02em]">
                    {l.name}
                  </div>
                  <div className="mt-1 text-[22px] text-text-2">
                    {copy.photobox.photos(l.layout.slots.length)} · {l.info.split("·")[0]?.trim()}
                  </div>
                </div>
                {l.price !== undefined && (
                  <span className="shrink-0 rounded-full border-2 border-ink bg-white px-4 py-1 text-[28px] font-extrabold">
                    {rupiahShort(l.price)}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <footer className="flex items-center justify-between gap-10">
        <Button
          variant="secondary"
          className="h-[104px] rounded-[26px] px-20 text-[34px]"
          onClick={onBack}
        >
          <ArrowLeft size={34} strokeWidth={2.5} /> {t.back}
        </Button>
        <Button
          className="h-[104px] max-w-[760px] flex-1 rounded-[26px] text-[34px]"
          disabled={!chosen}
          onClick={() => chosen && onChoose(chosen.id)}
        >
          <span className="truncate">
            {design ? copy.design.start : t.toPayment}
            {chosen && layouts.length > 1 && (
              <span className="font-semibold"> · {chosen.name}</span>
            )}
          </span>
          <ArrowRight size={34} strokeWidth={2.5} className="shrink-0" />
        </Button>
      </footer>
    </main>
  );
}
