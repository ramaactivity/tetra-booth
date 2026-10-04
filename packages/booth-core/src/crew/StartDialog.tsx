import { Flag, FlaskConical, Pause, Play, X } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "../copy";

const t = copy.crew.go;

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-10 min-w-10 items-center justify-center rounded-[10px] border-2 border-b-[5px] border-ink bg-white px-2.5 font-mono text-lg font-bold">
      {children}
    </kbd>
  );
}

/** Layar kecil dengan titik di pojok kanan atas: tempat ketuk 5× untuk masuk mode crew. */
function CornerMap() {
  return (
    <span
      aria-hidden
      className="relative block h-[66px] w-[104px] flex-none rounded-[10px] border-2 border-ink bg-paper"
    >
      <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full border-2 border-ink bg-mint text-[11px] font-extrabold">
        5×
      </span>
      <span className="absolute bottom-2 left-2 h-1.5 w-12 rounded-full bg-ink/20" />
      <span className="absolute bottom-5 left-2 h-1.5 w-8 rounded-full bg-ink/20" />
    </span>
  );
}

const STEP_ICON = [Pause, Flag, Play] as const;

/**
 * Pop-up "Buka untuk Tamu" (#152): Mulai acara (timer mulai di sesi tamu pertama) atau Tes dulu (sesi ditandai tes),
 * plus pengingat cara masuk mode crew dan letak Jeda / Hentikan / Rekap. `paused` = acara dijeda: Lanjutkan.
 */
export function StartDialog({
  paused,
  onStart,
  onTest,
  onClose,
}: {
  paused: boolean;
  onStart: () => void;
  onTest: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="go-title"
      data-testid="start-dialog"
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/35"
    >
      <div className="layered flex w-[1280px] flex-col gap-8 rounded-[32px] border-[2.5px] border-ink bg-white p-12 [--lx:10px]">
        <header className="flex items-start justify-between gap-8">
          <div>
            <h2
              id="go-title"
              className="text-[52px] leading-none font-extrabold tracking-[-0.03em]"
            >
              {paused ? t.titlePaused : t.title}
            </h2>
            <p className="mt-4 text-2xl font-semibold text-text-2">
              {paused ? t.subPaused : t.sub}
            </p>
          </div>
          <button
            type="button"
            aria-label={t.close}
            onClick={onClose}
            className="pressable flex size-16 flex-none items-center justify-center rounded-full border-[2.5px] border-ink bg-paper"
          >
            <X size={30} strokeWidth={2.5} />
          </button>
        </header>

        <div className="grid grid-cols-[1.35fr_1fr] gap-6">
          <button
            type="button"
            onClick={onStart}
            className="pressable layered flex min-h-[184px] items-center gap-7 rounded-[26px] border-[2.5px] border-ink bg-butter px-9 text-left [--lx:8px] [--under:#fff]"
          >
            <span className="flex size-24 flex-none items-center justify-center rounded-full border-[2.5px] border-ink bg-mint">
              <Play size={44} strokeWidth={2.5} />
            </span>
            <span>
              <span className="block text-[40px] leading-tight font-extrabold tracking-[-0.02em]">
                {paused ? t.resume : t.start}
              </span>
              <span className="mt-1.5 block text-xl font-semibold text-text-3">
                {paused ? t.resumeNote : t.startNote}
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={onTest}
            className="pressable flex min-h-[184px] items-center gap-6 rounded-[26px] border-[2.5px] border-ink bg-paper px-8 text-left"
          >
            <span className="flex size-20 flex-none items-center justify-center rounded-full border-[2.5px] border-ink bg-white">
              <FlaskConical size={36} strokeWidth={2.25} />
            </span>
            <span>
              <span className="block text-[34px] leading-tight font-extrabold tracking-[-0.02em]">
                {t.test}
              </span>
              <span className="mt-1.5 block text-xl font-semibold text-text-3">{t.testNote}</span>
            </span>
          </button>
        </div>

        <section
          aria-label={t.guide}
          className="flex flex-col gap-5 rounded-[24px] border-[2.5px] border-dashed border-ink px-8 py-6"
        >
          <h3 className="text-lg font-extrabold tracking-[0.04em] text-text-2 uppercase">
            {t.guide}
          </h3>
          <div className="flex items-center gap-6" data-testid="crew-entry-guide">
            <CornerMap />
            <div className="flex flex-col gap-2">
              <p className="text-2xl font-extrabold">{t.enter}</p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xl font-semibold text-text-2">
                <span className="text-ink">{t.corner}</span>
                <span>{t.hold}</span>
                <span>{t.keys}</span>
                <span className="flex items-center gap-1.5 text-ink">
                  <Key>Ctrl</Key>+<Key>Shift</Key>+<Key>M</Key>
                </span>
                <span>{t.pin}</span>
              </p>
            </div>
          </div>
          <ol className="grid grid-cols-3 gap-4 border-t-2 border-dashed border-ink/40 pt-5">
            {t.steps.map(([title, body], i) => {
              const Icon = STEP_ICON[i] ?? Play;
              return (
                <li key={title} className="flex items-start gap-3.5">
                  <span className="flex size-11 flex-none items-center justify-center rounded-full border-2 border-ink bg-paper">
                    <Icon size={20} strokeWidth={2.5} />
                  </span>
                  <span>
                    <span className="block text-xl font-extrabold">{title}</span>
                    <span className="mt-0.5 block text-lg leading-snug font-semibold text-text-2">
                      {body}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}
