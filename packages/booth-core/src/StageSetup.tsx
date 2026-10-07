import { STAGE_GAP } from "@tetra/shared";
import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";
import { copy } from "./copy";
import type { BoothEvent } from "./event";
import type { StageShot } from "./stage";

const t = copy.stage.setup;
const hms = (ms: number) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .format(ms)
    .replaceAll(":", ".");

const card = (on: boolean) =>
  `rounded-[28px] border-[2.5px] border-ink text-left ${on ? "layered bg-mint-soft [--lb:2.5px] [--lx:8px] [--under:var(--mint)]" : "bg-white"}`;
const pill = (on: boolean) =>
  `whitespace-nowrap rounded-full border-2 border-ink px-3.5 py-1 text-base font-bold ${on ? "bg-mint-soft" : "bg-white"}`;
const Ok = ({ size = 28 }: { size?: number }) => (
  <span
    style={{ width: size, height: size }}
    className="flex flex-none items-center justify-center rounded-full border-2 border-ink bg-green text-white"
  >
    <Check className="size-[60%]" strokeWidth={3.5} aria-hidden />
  </span>
);

/**
 * Persiapan laptop stage (#188, desain A1): 5 langkah sebelum acara. Peran, event, dan jenis kamera dipilih di
 * Crew (ganti = aplikasi dibuka ulang), jadi langkah 1 dan kartu kamera hanya menampilkan pilihan yang aktif.
 * Jepretan selama wizard terbuka = foto tes (tidak masuk rombongan).
 */
export function StageSetup({
  event,
  testShot,
  testThumb,
  cameraOk,
  model,
  tvOn,
  tvTest,
  setTvTest,
  gapSec,
  setGap,
  colorSummary,
  renderColor,
  onDone,
}: {
  event: BoothEvent;
  testShot: StageShot | undefined;
  testThumb: string | undefined;
  cameraOk: boolean;
  model: string | null | undefined;
  tvOn: boolean;
  tvTest: boolean;
  setTvTest: (on: boolean) => void;
  gapSec: number | null;
  setGap: (s: number | null) => void;
  colorSummary: string;
  renderColor: (onDone: () => void) => ReactNode;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const folder = model === "Hot folder";
  const camName = folder ? t.folder[0] : (model ?? t.canon[0]);
  const next = () => (step === 5 ? onDone() : setStep(step + 1));
  const [title, subtitle] = t.titles[step - 1] ?? ["", ""];
  const autoOn = gapSec !== null;
  const sec = gapSec ?? STAGE_GAP.default;
  const hint = step === 2 && !testShot ? t.hintNoTest : step === 4 ? t.hintColor : "";
  const summary = [
    "Stage",
    event.name,
    `${camName}${testShot ? ` · ${t.sumTestOk}` : ""}`,
    t.sumTv(tvOn),
    colorSummary,
    t.sumAuto(gapSec),
    t.sumGroups(event.settings.stageGroups.length),
  ];
  // Yang belum siap ditandai peach (bisa tetap mulai): kamera tanpa foto tes, TV belum tersambung.
  const warn = [false, false, !testShot || !cameraOk, !tvOn, false, false, false];

  return (
    <div
      className="absolute inset-0 z-30 flex flex-col gap-8 bg-paper px-16 pt-11 pb-12"
      data-testid="stage-setup"
    >
      <header className="flex flex-none items-center gap-7">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border-[2.5px] border-ink bg-mint text-[22px] font-extrabold">
            T
          </span>
          <span className="text-2xl font-extrabold tracking-[-0.02em]">tetra</span>
        </div>
        <span className="whitespace-nowrap rounded-full border-2 border-ink bg-lavender px-4 py-1.5 text-lg font-bold">
          {t.crewMode}
        </span>
        <div className="flex-1" />
        <ol className="flex items-center">
          {t.steps.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const act = n === step;
            return (
              <li key={label} className="flex items-center">
                <span className="flex items-center gap-3 px-1">
                  <span
                    className={`flex size-[42px] flex-none items-center justify-center rounded-full border-[2.5px] border-ink text-lg font-extrabold ${done ? "bg-green text-white" : act ? "bg-ink text-white" : "bg-white"}`}
                  >
                    {done ? <Check className="size-5" strokeWidth={3.5} aria-hidden /> : n}
                  </span>
                  <span
                    className={`whitespace-nowrap text-lg ${act ? "font-extrabold" : "font-semibold"}`}
                  >
                    {label}
                  </span>
                </span>
                {n < 5 && (
                  <span
                    className={`mx-3 w-11 border-t-[2.5px] border-ink ${done ? "border-solid" : "border-dashed"}`}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <div className="flex flex-none items-baseline gap-5">
          <h1 className="text-[68px] leading-none font-extrabold tracking-[-0.035em]">{title}</h1>
          <span className="text-2xl text-text-2">{subtitle}</span>
        </div>

        {step === 1 && (
          <div className="grid min-h-0 flex-1 grid-cols-[640px_minmax(0,1fr)] gap-10">
            <div className="flex flex-col gap-[18px]">
              <span className="text-[22px] font-extrabold">{t.roleTitle}</span>
              {t.roles.map(([name, desc], i) => (
                <div
                  key={name}
                  className={`${card(i === 1)} flex flex-col gap-2 px-[30px] py-[26px]`}
                >
                  <span className="flex items-center justify-between text-[32px] font-extrabold tracking-[-0.02em]">
                    {name}
                    {i === 1 ? (
                      <Ok size={40} />
                    ) : (
                      <span className="size-10 rounded-full border-[2.5px] border-ink bg-white" />
                    )}
                  </span>
                  <span className="text-xl leading-[1.4] text-text-3">{desc}</span>
                </div>
              ))}
              <div className="rounded-[18px] border-2 border-dashed border-ink bg-sky px-5 py-4 text-lg leading-[1.45] text-text-3">
                {t.roleNote} {t.changeViaCrew}
              </div>
            </div>
            <div className="flex flex-col gap-[18px]">
              <span className="text-[22px] font-extrabold">{t.eventTitle}</span>
              <div className={`${card(true)} flex items-center gap-6 rounded-3xl px-7 py-[22px]`}>
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="text-[28px] font-extrabold tracking-[-0.02em]">
                    {event.name}
                  </span>
                  <span className="font-mono text-lg text-text-2">{event.date}</span>
                </div>
                <span className={`${pill(false)} bg-butter`}>{t.today}</span>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_820px] gap-10">
            <div className="flex flex-col gap-[18px]">
              {(
                [
                  [!folder, t.canon, folder ? t.canon[0] : (model ?? "—")],
                  [folder, t.folder, ""],
                ] as const
              ).map(([on, [name, desc], detail]) => (
                <div key={name} className={`${card(on)} flex flex-col gap-2.5 px-7 py-6`}>
                  <span className="flex items-center justify-between text-[28px] font-extrabold tracking-[-0.02em]">
                    {name}
                    <span className={pill(on && cameraOk)}>
                      {on
                        ? cameraOk
                          ? folder
                            ? t.watched
                            : t.connected
                          : t.notConnected
                        : name === t.canon[0]
                          ? "Canon"
                          : t.otherBrand}
                    </span>
                  </span>
                  <span className="text-[19px] leading-[1.45] text-text-3">{desc}</span>
                  {on && detail && (
                    <span className="font-mono text-base text-text-2">{detail}</span>
                  )}
                </div>
              ))}
              <span className="text-base text-text-2">{t.changeViaCrew}</span>
            </div>
            <div className="flex flex-col gap-4 rounded-[32px] border-[3px] border-ink bg-white p-6">
              {testShot ? (
                <>
                  <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border-2 border-ink bg-neutral">
                    {testThumb && <img src={testThumb} alt="" className="size-full object-cover" />}
                  </div>
                  <div className="flex items-center gap-3.5">
                    <Ok size={40} />
                    <div className="flex flex-col">
                      <span className="text-[22px] font-extrabold">{t.testIn}</span>
                      <span className="font-mono text-[15px] text-text-2">
                        {hms(testShot.at)} · {testShot.width} × {testShot.height}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3.5 rounded-[20px] border-[2.5px] border-dashed border-ink p-6 text-center">
                  <span className="text-[34px] font-extrabold tracking-[-0.02em]">
                    {t.testTitle}
                  </span>
                  <span className="max-w-[520px] text-xl leading-[1.45] text-text-3">
                    {t.testBody}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_640px] gap-10">
            <div className="flex flex-col gap-[18px]">
              {(
                [
                  ["1", t.laptopScreen, t.operator, false, "bg-neutral"],
                  ["2", t.tvScreen, tvOn ? "TV" : t.tvMissing, tvOn, "bg-white"],
                ] as const
              ).map(([n, name, tag, on, screen]) => (
                <div
                  key={n}
                  className={`${card(on)} flex items-center gap-6 rounded-3xl px-7 py-[22px]`}
                >
                  <span
                    className={`flex h-[72px] w-[120px] flex-none items-center justify-center rounded-[10px] border-[2.5px] border-ink font-mono text-[28px] font-medium ${screen}`}
                  >
                    {n}
                  </span>
                  <span className="flex-1 text-[26px] font-extrabold tracking-[-0.02em]">
                    {name}
                  </span>
                  <span className={`${pill(on)} ${n === "1" ? "bg-lavender" : ""}`}>{tag}</span>
                </div>
              ))}
              <div className="mt-1.5 flex items-center gap-5">
                <button
                  type="button"
                  disabled={!tvOn}
                  onClick={() => setTvTest(!tvTest)}
                  className="pressable layered h-20 whitespace-nowrap rounded-[22px] border-[2.5px] border-ink bg-white px-[30px] text-2xl font-extrabold disabled:opacity-40 [--lb:2.5px] [--lx:7px]"
                >
                  {tvTest ? t.tvTestOff : t.tvTest}
                </button>
                {tvTest && (
                  <span className="rounded-2xl border-2 border-ink bg-mint-soft px-[18px] py-3 text-[19px] leading-[1.4] font-semibold">
                    {t.tvTestOn}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-4 rounded-[28px] border-2 border-dashed border-ink bg-sky px-[30px] py-7">
              <span className="text-2xl font-extrabold">{t.tvHowTitle}</span>
              <span className="text-lg leading-[1.45] text-text-3">{t.tvHowBody}</span>
              <div className="flex flex-col">
                {t.tvHow.map(([k, v], i) => (
                  <div
                    key={k}
                    className={`flex justify-between gap-4 py-3.5 text-lg ${i < 2 ? "border-b-[1.5px] border-dashed border-ink" : ""}`}
                  >
                    <span className="font-extrabold">{k}</span>
                    <span className="text-right text-text-3">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="flex min-h-0 flex-1 justify-center">{renderColor(next)}</div>
        )}

        {step === 5 && (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_600px] gap-10">
            <div className="flex flex-col gap-[18px]">
              <div className={`${card(autoOn)} flex flex-col gap-[18px] px-[30px] py-[26px]`}>
                <button
                  type="button"
                  onClick={() => setGap(sec)}
                  className="flex flex-col gap-[18px] text-left"
                >
                  <span className="text-[30px] font-extrabold tracking-[-0.02em]">
                    {t.autoTitle}
                  </span>
                  <span className="text-[19px] leading-[1.45] text-text-3">{t.autoBody}</span>
                </button>
                <div className="flex items-center gap-4">
                  <div className="flex h-[72px] items-center overflow-hidden rounded-[20px] border-[2.5px] border-ink bg-white">
                    <button
                      type="button"
                      aria-label="Kurangi"
                      onClick={() => setGap(Math.max(STAGE_GAP.min, sec - 15))}
                      className="h-full w-[72px] border-r-2 border-ink text-[30px] font-bold"
                    >
                      −
                    </button>
                    <span className="w-[150px] text-center font-mono text-[28px] font-medium">
                      {sec} dtk
                    </span>
                    <button
                      type="button"
                      aria-label="Tambah"
                      onClick={() => setGap(Math.min(STAGE_GAP.max, sec + 15))}
                      className="h-full w-[72px] border-l-2 border-ink text-[30px] font-bold"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-[17px] text-text-2">{t.autoRange}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGap(null)}
                className={`${card(!autoOn)} flex flex-col gap-2.5 px-[30px] py-[26px]`}
              >
                <span className="text-[30px] font-extrabold tracking-[-0.02em]">{t.offTitle}</span>
                <span className="text-[19px] leading-[1.45] text-text-3">{t.offBody}</span>
              </button>
            </div>
            <div className="flex flex-col rounded-[28px] border-[2.5px] border-ink bg-white px-[30px] py-[26px]">
              <span className="mb-2 text-2xl font-extrabold">{t.ready}</span>
              {t.sum.map((k, i) => (
                <div
                  key={k}
                  className="flex items-center gap-3.5 border-b-[1.5px] border-dashed border-line-soft py-[13px]"
                >
                  {warn[i] ? (
                    <span className="flex size-7 flex-none items-center justify-center rounded-full border-2 border-ink bg-peach text-sm font-extrabold">
                      !
                    </span>
                  ) : (
                    <Ok />
                  )}
                  <span className="w-[120px] flex-none text-lg font-bold">{k}</span>
                  <span className="truncate text-lg text-text-3">{summary[i]}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <footer className="flex flex-none items-center gap-5">
        <button
          type="button"
          onClick={() => (step === 1 ? onDone() : setStep(step - 1))}
          className="pressable layered h-[92px] rounded-3xl border-[2.5px] border-ink bg-white px-9 text-[26px] font-extrabold [--lb:2.5px] [--lx:8px]"
        >
          {step === 1 ? t.cancel : t.back}
        </button>
        <div className="flex-1" />
        <span className="text-lg text-text-2">{hint}</span>
        {step !== 4 && (
          <button
            type="button"
            onClick={next}
            className="pressable layered h-[100px] whitespace-nowrap rounded-[26px] border-[3px] border-ink bg-butter px-11 text-[30px] font-extrabold tracking-[-0.02em] [--lb:3px] [--lx:8px]"
          >
            {t.next[step - 1]}
          </button>
        )}
      </footer>
    </div>
  );
}
