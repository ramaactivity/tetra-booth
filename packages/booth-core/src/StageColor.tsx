import {
  DEFAULT_STAGE_PRESET,
  PHOTO_FILTERS,
  type StagePreset,
  stagePresetCss,
} from "@tetra/shared";
import { ArrowLeftRight } from "lucide-react";
import { useEffect, useState } from "react";
import { copy } from "./copy";
import { errText } from "./errors";
import type { Lut, StoredLut } from "./lut";
import { usePlatform } from "./PlatformContext";
import type { StageShot } from "./stage";
import { renderJpeg } from "./stageImage";

const t = copy.stage;
type ActiveLut = StoredLut & { lut: Lut };
const SLIDERS = [
  ["brightness", t.brightness],
  ["contrast", t.contrast],
  ["saturation", t.saturation],
  ["warmth", t.warmth],
] as const;
const mb = (bytes: number) =>
  bytes < 1e6
    ? `${Math.max(1, Math.round(bytes / 1e3))} KB`
    : `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(bytes / 1e6)} MB`;
const hms = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .format(ms)
    .replaceAll(":", ".");

/** Foto tes 1280 px: `before` tanpa LUT, `after` dengan LUT (filter preset dipasang lewat CSS). */
function useTestPhoto(shot: StageShot | undefined, lut: ActiveLut | null) {
  const p = usePlatform();
  const [urls, setUrls] = useState<{ before: string; after: string } | null>(null);
  const path = shot?.path;
  useEffect(() => {
    if (!path) return;
    let live = true;
    const made: string[] = [];
    const url = (b: Uint8Array<ArrayBuffer>) => {
      const u = URL.createObjectURL(new Blob([b], { type: "image/jpeg" }));
      made.push(u);
      return u;
    };
    void p.storage
      .readFile(path)
      .then(async (raw) => {
        const before = url(await renderJpeg(raw, 1280, "none", 0.85));
        const after = lut ? url(await renderJpeg(raw, 1280, "none", 0.85, lut.lut)) : before;
        if (live) setUrls({ before, after });
      })
      .catch((e: unknown) => console.warn(`[stage] foto tes gagal: ${errText(e)}`));
    return () => {
      live = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, [path, lut, p]);
  return urls;
}

/**
 * Dialog Warna laptop stage (#187, desain A4): pembanding sebelum/sesudah dari foto tes terakhir, LUT `.cube`
 * (#184), filter, 4 slider −50…50 dari tengah. Preset tersimpan otomatis per event di laptop ini.
 */
export function StageColor({
  preset,
  savePreset,
  lut,
  lutError,
  pickLut,
  removeLut,
  shot,
  model,
  doneLabel = t.done,
  inline = false,
  onClose,
}: {
  preset: StagePreset;
  savePreset: (p: StagePreset) => void;
  lut: ActiveLut | null;
  lutError: string | null;
  pickLut: (f: File) => void;
  removeLut: () => void;
  shot: StageShot | undefined;
  model: string | null | undefined;
  doneLabel?: string;
  /** Di dalam wizard persiapan (A1): tanpa lapisan gelap, diperkecil 0,74. */
  inline?: boolean;
  onClose: () => void;
}) {
  const [split, setSplit] = useState(50);
  const photo = useTestPhoto(shot, lut);
  const css = stagePresetCss(preset);

  return (
    <div
      className={
        inline
          ? "[zoom:0.74]"
          : "absolute inset-0 z-40 flex items-center justify-center bg-[rgba(29,29,27,.42)]"
      }
    >
      <div
        role="dialog"
        aria-label={t.colorTitle}
        className="grid h-[880px] w-[1640px] grid-cols-[minmax(0,1fr)_540px] gap-10 rounded-[36px] border-[3px] border-ink bg-white p-9"
      >
        <div className="flex min-w-0 flex-col gap-4">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[20px] border-[2.5px] border-ink bg-neutral">
            {photo ? (
              <>
                <img
                  src={photo.before}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
                <img
                  src={photo.after}
                  alt=""
                  style={{ filter: css, clipPath: `inset(0 0 0 ${split}%)` }}
                  className="absolute inset-0 size-full object-cover"
                />
                <div
                  className="absolute inset-y-0 -ml-[1.5px] w-[3px] bg-white shadow-[0_0_0_1.5px_var(--ink)]"
                  style={{ left: `${split}%` }}
                />
                <div
                  className="absolute top-1/2 -mt-[26px] -ml-[26px] flex size-[52px] items-center justify-center rounded-full border-[2.5px] border-ink bg-white"
                  style={{ left: `${split}%` }}
                >
                  <ArrowLeftRight className="size-6" strokeWidth={2.5} aria-hidden />
                </div>
                <span className="absolute top-5 left-5 rounded-full border-2 border-ink bg-white px-3.5 py-1.5 text-base font-bold">
                  {t.before}
                </span>
                <span className="absolute top-5 right-5 rounded-full border-2 border-ink bg-mint-soft px-3.5 py-1.5 text-base font-bold">
                  {t.after}
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={split}
                  aria-label={t.compareHint}
                  onChange={(e) => setSplit(Number(e.target.value))}
                  className="absolute inset-0 m-0 size-full cursor-ew-resize opacity-0"
                />
              </>
            ) : (
              <p className="flex size-full items-center justify-center px-10 text-center text-2xl text-text-2">
                {t.noPhoto}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3.5 text-[15px] text-text-2">
            <span className="font-mono">{shot ? t.testShot(hms(shot.at), model ?? null) : ""}</span>
            <span className="flex-1" />
            {photo && <span>{t.compareHint}</span>}
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-[22px]">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[34px] font-extrabold tracking-[-0.03em]">{t.colorTitle}</h2>
            <p className="text-[17px] leading-[1.4] text-text-2">{t.colorHint}</p>
          </div>

          <div className="flex flex-col gap-2.5">
            <div
              className={`flex min-h-[60px] items-center gap-3 rounded-2xl border-2 border-ink py-2 pr-2.5 pl-4 ${lutError ? "bg-coral" : lut ? "bg-mint-soft" : "bg-white"}`}
            >
              <span className="flex-none text-base font-extrabold">LUT</span>
              <span
                data-testid="stage-lut"
                className="min-w-0 flex-1 truncate font-mono text-sm text-text-3"
              >
                {lut ? `${lut.name} · ${mb(lut.text.length)}` : t.lutNoneLabel}
              </span>
              {lut && (
                <button
                  type="button"
                  onClick={removeLut}
                  className="pressable h-10 rounded-[11px] border-[1.5px] border-ink bg-white px-3.5 text-[15px] font-bold"
                >
                  {t.lutRemove}
                </button>
              )}
              <label className="pressable flex h-10 cursor-pointer items-center whitespace-nowrap rounded-[11px] border-[1.5px] border-ink bg-lavender px-3.5 text-[15px] font-bold has-focus-visible:outline-2">
                {t.lutPick}
                <input
                  type="file"
                  accept=".cube"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) pickLut(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {lutError && (
              <div
                role="alert"
                className="rounded-xl border-[1.5px] border-dashed border-ink bg-coral px-3.5 py-2.5 text-[15px] leading-[1.4] font-semibold"
              >
                {lutError}
              </div>
            )}
            <span className="text-[13px] text-muted">{t.lutNote}</span>
          </div>

          <div className="flex h-12 flex-none overflow-hidden rounded-[14px] border-2 border-ink">
            {PHOTO_FILTERS.map((f, i) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={preset.filter === f.id}
                onClick={() => savePreset({ ...preset, filter: f.id })}
                className={`flex-1 whitespace-nowrap px-1.5 text-[15px] font-bold ${i < PHOTO_FILTERS.length - 1 ? "border-r-[1.5px] border-ink" : ""} ${preset.filter === f.id ? "bg-mint" : "bg-white"}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3.5">
            {SLIDERS.map(([k, label]) => {
              const v = preset[k];
              const pos = v + 50;
              return (
                <div key={k} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-base font-bold">
                    <span>{label}</span>
                    <span className="font-mono font-medium">{v > 0 ? `+${v}` : v}</span>
                  </div>
                  <div className="relative h-[30px]">
                    <div className="absolute inset-x-0 top-[11px] h-2 rounded-full border-[1.5px] border-ink bg-white" />
                    <div
                      className="absolute top-[11px] h-2 border-y-[1.5px] border-ink bg-mint"
                      style={{ left: `${Math.min(50, pos)}%`, width: `${Math.abs(pos - 50)}%` }}
                    />
                    <div className="absolute top-0.5 left-1/2 -ml-px h-[26px] w-0.5 bg-line-soft" />
                    <div
                      className="absolute top-0.5 -ml-[13px] size-[26px] rounded-full border-[2.5px] border-ink bg-white"
                      style={{ left: `${pos}%` }}
                    />
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={v}
                      aria-label={label}
                      onChange={(e) => savePreset({ ...preset, [k]: Number(e.target.value) })}
                      className="absolute inset-0 m-0 size-full cursor-pointer opacity-0"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex-1" />
          <div className="flex items-center gap-2.5 border-t-2 border-dashed border-ink pt-4 text-[15px]">
            <span className="font-bold">{t.presetLabel}</span>
            <span className="flex-1 truncate font-mono text-text-3">{t.presetAuto}</span>
          </div>
          <div className="grid grid-cols-[1fr_1.4fr] gap-4">
            <button
              type="button"
              onClick={() => {
                savePreset(DEFAULT_STAGE_PRESET);
                removeLut();
              }}
              className="pressable layered h-20 rounded-[22px] border-[2.5px] border-ink bg-white text-[22px] font-extrabold [--lb:2.5px] [--lx:7px] [--under:#fff]"
            >
              {t.reset}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="pressable layered h-20 rounded-[22px] border-[2.5px] border-ink bg-butter text-[22px] font-extrabold [--lb:2.5px] [--lx:7px] [--under:#fff]"
            >
              {doneLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
