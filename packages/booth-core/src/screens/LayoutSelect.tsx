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

/** Miniatur layout: kertas dengan slot bergaris sesuai spesifikasi layout. */
function Mini({ layout }: { layout: EventDesign["layout"] }) {
  const { width, height } = layout.canvas;
  const scale = 340 / Math.max(width, height);
  return (
    <div
      style={{ width: width * scale, height: height * scale }}
      className="relative border-2 border-ink bg-white"
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
  return (
    <main className="flex h-full w-full flex-col gap-10 bg-paper px-[100px] py-16 portrait:px-12">
      <header className="flex items-center justify-between">
        <Logo />
        {!design && <PhotoboxSteps current={0} />}
        <span className="w-[180px]" />
      </header>
      <h1 className="text-[88px] leading-none font-extrabold tracking-[-0.045em]">
        {design ? copy.design.chooseTitle : t.chooseTitle}
      </h1>
      <div className="grid flex-1 grid-cols-4 gap-10 portrait:grid-cols-2">
        {layouts.map((l) => {
          const on = picked === l.id;
          return (
            <button
              key={l.id}
              type="button"
              data-testid="layout-card"
              aria-pressed={on}
              onClick={() => setPicked(l.id)}
              style={{ ["--under" as string]: on ? "var(--mint)" : "#fff" }}
              className={`pressable layered relative flex flex-col rounded-[28px] border-[2.5px] border-ink px-8 pt-16 pb-7 text-left [--lx:10px] ${on ? "bg-mint-soft" : "bg-white"}`}
            >
              {on && <Done size={52} className="absolute top-5 right-5" />}
              <div className="flex flex-1 items-center justify-center">
                {preview?.[l.id] ? (
                  <img
                    src={preview[l.id]}
                    alt=""
                    className="max-h-[340px] max-w-full border-2 border-ink bg-white"
                  />
                ) : (
                  <Mini layout={l.layout} />
                )}
              </div>
              <div className="mt-8 border-t-2 border-dashed border-ink pt-5">
                <div className="text-[34px] font-extrabold tracking-[-0.03em]">{l.name}</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-[21px] text-text-2">
                    {copy.photobox.photos(l.layout.slots.length)} · {l.info.split("·")[0]?.trim()}
                  </span>
                  {l.price !== undefined && (
                    <span className="text-[30px] font-extrabold">{rupiahShort(l.price)}</span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <footer className="flex justify-between gap-10">
        <Button
          variant="secondary"
          className="h-[104px] rounded-[26px] px-24 text-[34px]"
          onClick={onBack}
        >
          <ArrowLeft size={34} strokeWidth={2.5} /> {t.back}
        </Button>
        <Button
          className="h-[104px] flex-1 rounded-[26px] text-[34px] max-w-[640px]"
          disabled={!picked}
          onClick={() => picked && onChoose(picked)}
        >
          {design ? copy.design.start : t.toPayment} <ArrowRight size={34} strokeWidth={2.5} />
        </Button>
      </footer>
    </main>
  );
}
