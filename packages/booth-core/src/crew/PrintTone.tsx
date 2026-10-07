import { useState } from "react";
import { copy } from "../copy";
import { loadPrintTone, PRINT_TONE_RANGE, type PrintTone, savePrintTone } from "../printTone";

const t = copy.crew.printTone;
const ROWS = [
  ["brightness", t.brightness],
  ["contrast", t.contrast],
  ["saturation", t.saturation],
] as const;

/** Kalibrasi warna lembar cetak per laptop (#208): langsung tersimpan, dipakai Tes Cetak berikutnya. */
export function PrintToneCard() {
  const [tone, setTone] = useState<PrintTone>(loadPrintTone);
  const set = (next: PrintTone) => {
    setTone(next);
    savePrintTone(next);
  };
  return (
    <div
      className="col-span-full flex flex-col gap-4 rounded-2xl border-2 border-line-soft p-5"
      data-testid="print-tone"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-2xl font-extrabold">{t.title}</span>
          <span className="text-lg text-text-2">{t.note}</span>
        </div>
        <button
          type="button"
          onClick={() => set({ brightness: 0, contrast: 0, saturation: 0 })}
          className="pressable h-12 flex-none rounded-xl border-2 border-ink bg-white px-4 text-lg font-bold"
        >
          {t.reset}
        </button>
      </div>
      {ROWS.map(([k, label]) => {
        const v = tone[k];
        const pos = ((v + PRINT_TONE_RANGE) / (2 * PRINT_TONE_RANGE)) * 100;
        return (
          <div key={k} className="flex items-center gap-5">
            <span className="w-40 flex-none text-xl font-bold">{label}</span>
            <div className="relative h-[34px] flex-1">
              <div className="absolute inset-x-0 top-[13px] h-2 rounded-full border-[1.5px] border-ink bg-white" />
              <div
                className="absolute top-[13px] h-2 border-y-[1.5px] border-ink bg-mint"
                style={{ left: `${Math.min(50, pos)}%`, width: `${Math.abs(pos - 50)}%` }}
              />
              <div className="absolute top-1 left-1/2 -ml-px h-[26px] w-0.5 bg-line-soft" />
              <div
                className="absolute top-1 -ml-[13px] size-[26px] rounded-full border-[2.5px] border-ink bg-white"
                style={{ left: `${pos}%` }}
              />
              <input
                type="range"
                min={-PRINT_TONE_RANGE}
                max={PRINT_TONE_RANGE}
                step={1}
                value={v}
                aria-label={label}
                onChange={(e) => set({ ...tone, [k]: Number(e.target.value) })}
                className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
              />
            </div>
            <span className="w-14 flex-none text-right font-mono text-xl">
              {v > 0 ? `+${v}` : v}
            </span>
          </div>
        );
      })}
    </div>
  );
}
