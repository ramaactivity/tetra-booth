"use client";
import {
  durationText,
  type EventRun,
  type RunAction,
  runElapsedMs,
  runPausedMs,
  runState,
} from "@tetra/shared";
import { Flag, Pause, Pencil, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { copy } from "@/lib/copy";
import { clockWib } from "@/lib/recap";
import { correctRun, runEvent } from "./actions";

const t = copy.admin.run;
const btn =
  "pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink px-4 text-sm font-extrabold disabled:opacity-50";
const primary = `${btn} layered bg-butter [--lb:1.5px] [--lx:4px]`;
const secondary = `${btn} bg-white hover:bg-mint-soft`;
const input =
  "h-11 rounded-xl border-[1.5px] border-ink bg-white px-3 font-mono text-sm focus-visible:outline-mint";
/** Booth bisa mengubah timer (Buka untuk Tamu, Jeda); dashboard menyegarkan diri tiap 30 dtk. */
const REFRESH_MS = 30_000;

const PILL: Record<ReturnType<typeof runState>, string> = {
  idle: "bg-neutral",
  running: "bg-mint-soft",
  paused: "bg-peach",
  finished: "bg-sky",
};

/** "02:14:07" */
const stopwatch = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
};
/** ISO → nilai `<input type="datetime-local">` di zona waktu browser. */
const toLocal = (iso: string | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

/**
 * Timer jalannya event (DECISIONS #149): Mulai → Jeda/Lanjutkan → Selesai (konfirmasi), stopwatch tanpa jeda,
 * koreksi jam manual. Data saja; booth tidak dibatasi. Crew hanya melihat.
 */
export function RunPanel({
  eventId,
  run: initial,
  packageHours,
  canEdit,
}: {
  eventId: string;
  run: EventRun;
  packageHours: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState(initial);
  useEffect(() => setRun(initial), [initial]);
  const [now, setNow] = useState(() => Date.now());
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [edit, setEdit] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const state = runState(run);

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const pull = state === "finished" ? null : setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      clearInterval(tick);
      if (pull) clearInterval(pull);
    };
  }, [router, state]);

  const act = (a: RunAction) =>
    start(async () => {
      setMsg(null);
      const r = await runEvent(eventId, a);
      if (r.ok) setRun(r.run);
      else setMsg(r.message);
      setConfirm(false);
    });

  const elapsed = runElapsedMs(run, now);
  const paused = runPausedMs(run, now);
  const first = run.segments[0];
  const last = run.segments.at(-1);
  const left = packageHours ? packageHours * 3_600_000 - elapsed : null;
  const facts: [string, string][] = [
    [t.started, first ? clockWib(first.start) : "–"],
    [t.ended, state === "finished" && last?.end ? clockWib(last.end) : "–"],
    [t.paused, durationText(paused / 60_000)],
    [
      t.package,
      packageHours
        ? left !== null && state !== "finished" && state !== "idle"
          ? left >= 0
            ? t.left(durationText(left / 60_000))
            : t.over(durationText(-left / 60_000))
          : durationText(packageHours * 60)
        : t.noPackage,
    ],
  ];

  return (
    <section
      aria-label={t.title}
      data-testid="run-panel"
      data-state={state}
      className="flex flex-col gap-4 rounded-2xl border-[1.5px] border-ink bg-white px-5 py-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2.5">
              <span className="text-[15px] font-extrabold">{t.title}</span>
              <span
                data-testid="run-state"
                className={`rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-bold ${PILL[state]}`}
              >
                {t.state[state]}
              </span>
            </span>
            <span
              data-testid="run-elapsed"
              className="font-mono text-[34px] leading-none font-medium tracking-[-0.02em] tabular-nums"
            >
              {stopwatch(elapsed)}
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px] sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k} className="flex min-w-0 flex-col">
                <dt className="text-xs font-semibold text-text-2">{k}</dt>
                <dd className="font-bold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            {confirm ? (
              <>
                <span className="text-[13px] font-bold">{t.confirm}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => act("finish")}
                  className={`${btn} bg-coral`}
                >
                  {t.confirmYes}
                </button>
                <button type="button" onClick={() => setConfirm(false)} className={secondary}>
                  {t.cancel}
                </button>
              </>
            ) : (
              <>
                {state === "finished" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act("start")}
                    className={secondary}
                  >
                    <Play aria-hidden className="size-4" strokeWidth={2.5} /> {t.reopen}
                  </button>
                ) : state === "running" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act("pause")}
                    className={secondary}
                  >
                    <Pause aria-hidden className="size-4" strokeWidth={2.5} /> {t.pause}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => act("start")}
                    className={primary}
                  >
                    <Play aria-hidden className="size-4" strokeWidth={2.5} />
                    {state === "idle" ? t.start : t.resume}
                  </button>
                )}
                {(state === "running" || state === "paused") && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setConfirm(true)}
                    className={secondary}
                  >
                    <Flag aria-hidden className="size-4" strokeWidth={2.5} /> {t.finish}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEdit((e) => !e)}
                  aria-expanded={edit}
                  className={secondary}
                >
                  <Pencil aria-hidden className="size-4" strokeWidth={2.5} /> {t.edit}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {canEdit && edit && (
        <form
          className="flex flex-wrap items-end gap-3 border-t-[1.5px] border-dashed border-ink pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const s = String(f.get("start") ?? "");
            const en = String(f.get("end") ?? "");
            if (!s) return setMsg(t.needStart);
            start(async () => {
              const r = await correctRun(
                eventId,
                new Date(s).toISOString(),
                en ? new Date(en).toISOString() : null,
              );
              if (r.ok) {
                setRun(r.run);
                setEdit(false);
                setMsg(null);
              } else setMsg(r.message);
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">
            {t.started}
            <input
              name="start"
              type="datetime-local"
              defaultValue={toLocal(first?.start)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">
            <span>
              {t.ended}
              <span className="font-semibold text-muted"> · {t.optional}</span>
            </span>
            <input
              name="end"
              type="datetime-local"
              defaultValue={toLocal(state === "finished" ? last?.end : undefined)}
              className={input}
            />
          </label>
          <button type="submit" disabled={pending} className={primary}>
            {t.save}
          </button>
          <p className="basis-full text-xs text-text-2">{t.editHint}</p>
        </form>
      )}

      {msg ? (
        <p role="alert" className="text-[13px] font-bold">
          {msg}
        </p>
      ) : (
        state === "idle" && <p className="text-xs text-text-2">{t.hint}</p>
      )}
    </section>
  );
}
