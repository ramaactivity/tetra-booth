import { DEFAULT_STAGE_PRESET, PHOTO_FILTERS, type StagePreset } from "@tetra/shared";
import { copy } from "./copy";
import type { StoredLut } from "./lut";

const t = copy.stage;
const btn =
  "pressable flex h-[88px] items-center justify-center gap-3 rounded-2xl border-[2.5px] border-ink px-8 text-[28px] font-extrabold";

/** Dialog Warna laptop stage (#178, LUT #184): filter + slider preset dan LUT `.cube`, dari foto tes terakhir. */
export function StageColor({
  preset,
  savePreset,
  lut,
  lutError,
  pickLut,
  removeLut,
  lastThumb,
  css,
  onClose,
}: {
  preset: StagePreset;
  savePreset: (p: StagePreset) => void;
  lut: StoredLut | null;
  lutError: string | null;
  pickLut: (f: File) => void;
  removeLut: () => void;
  lastThumb: string | undefined;
  css: string;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[rgba(29,29,27,.42)]">
      <div
        className="flex w-[1400px] gap-8 rounded-3xl border-[2.5px] border-ink bg-white p-8"
        role="dialog"
        aria-label={t.colorTitle}
      >
        <div className="flex aspect-[3/2] w-[760px] items-center justify-center overflow-hidden rounded-2xl border-2 border-ink bg-neutral">
          {lastThumb ? (
            <img
              src={lastThumb}
              alt=""
              style={{ filter: css }}
              className="size-full object-contain"
            />
          ) : (
            <p className="px-10 text-center text-2xl text-text-2">{t.noPhoto}</p>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-5">
          <h2 className="text-[32px] font-extrabold">{t.colorTitle}</h2>
          <p className="text-xl text-text-2">{t.colorHint}</p>
          <div className="flex items-center gap-3 rounded-2xl border-2 border-line-soft p-3">
            <span className="text-xl font-bold">{t.lut}</span>
            <span className="min-w-0 flex-1 truncate text-lg text-text-2" data-testid="stage-lut">
              {lutError ?? lut?.name ?? t.lutNone}
            </span>
            {lut && (
              <button
                type="button"
                onClick={removeLut}
                className="rounded-full border-2 border-ink bg-white px-4 py-1.5 text-lg font-bold"
              >
                {t.lutRemove}
              </button>
            )}
            <label className="pressable cursor-pointer rounded-full border-2 border-ink bg-lavender px-4 py-1.5 text-lg font-bold has-focus-visible:outline-2">
              {t.lutPick}
              <input
                type="file"
                accept=".cube"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void pickLut(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {PHOTO_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => savePreset({ ...preset, filter: f.id })}
                className={`rounded-full border-2 border-ink px-4 py-2 text-xl font-bold ${preset.filter === f.id ? "bg-mint" : "bg-white"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {(
            [
              ["brightness", t.brightness, -50],
              ["contrast", t.contrast, -50],
              ["saturation", t.saturation, -50],
              ["warmth", t.warmth, 0],
            ] as const
          ).map(([k, label, min]) => (
            <label key={k} className="flex flex-col gap-1 text-xl font-bold">
              <span className="flex justify-between">
                {label}
                <span className="font-mono">{preset[k]}</span>
              </span>
              <input
                type="range"
                min={min}
                max={50}
                step={1}
                value={preset[k]}
                onChange={(e) => savePreset({ ...preset, [k]: Number(e.target.value) })}
                className="accent-ink"
              />
            </label>
          ))}
          <div className="mt-auto flex gap-3">
            <button
              type="button"
              onClick={() => savePreset(DEFAULT_STAGE_PRESET)}
              className={`${btn} h-16 bg-white text-2xl`}
            >
              {t.reset}
            </button>
            <button
              type="button"
              onClick={onClose}
              className={`${btn} layered h-16 flex-1 bg-butter text-2xl [--lb:2.5px] [--lx:6px]`}
            >
              {t.done}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
