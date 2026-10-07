import {
  DEFAULT_STAGE_PRESET,
  newSessionId,
  PHOTO_FILTERS,
  STAGE_GAP,
  type StagePreset,
  StagePresetSchema,
  stagePresetCss,
} from "@tetra/shared";
import { Settings, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { copy } from "./copy";
import { errText } from "./errors";
import type { BoothEvent } from "./event";
import { ORIGINAL_LONG_SIDE, THUMB_LONG_SIDE } from "./finalize";
import { usePlatform } from "./PlatformContext";
import type { SessionAsset } from "./platform";
import {
  activeGroup,
  groupLabel,
  initialStage,
  type StageGroup,
  stageReducer,
  tvState,
} from "./stage";
import { renderJpeg } from "./stageImage";
import { QrCode } from "./ui";

const t = copy.stage;
// ponytail: preset & jeda disimpan per laptop (localStorage); pindah ke pengaturan event cloud di S4.
const presetKey = (eventId: string) => `tetra.stage.preset.${eventId}`;
const GAP_KEY = "tetra.stage.gap";
const loadPreset = (eventId: string): StagePreset => {
  try {
    return StagePresetSchema.parse(JSON.parse(localStorage.getItem(presetKey(eventId)) ?? "{}"));
  } catch {
    return DEFAULT_STAGE_PRESET;
  }
};
const loadGap = (): number | null => {
  const v = localStorage.getItem(GAP_KEY);
  if (v === "off") return null;
  const n = Number(v);
  return n >= STAGE_GAP.min && n <= STAGE_GAP.max ? n : STAGE_GAP.default;
};
const iso = (ms: number) => new Date(ms).toISOString();

type SaveState = "saving" | "saved" | "failed";

/**
 * Layar operator Photo Stage (#178, docs/PLAN-PHOTO-STAGE.md §5): jepretan rana fotografer masuk otomatis,
 * dikelompokkan per rombongan (`stageReducer`), rombongan yang ditutup diproses (warna preset, 2400 px + thumb)
 * lalu jadi sesi `source: stage` di antrean upload yang sama dengan booth. Tampilan sementara; desain final dari
 * Claude Design. Jendela TV (S2) menyusul.
 */
export function StageRunner({
  event,
  guestBaseUrl,
  onCrew,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  onCrew: () => void;
}) {
  const p = usePlatform();
  const stage = p.stage;
  const [s, dispatch] = useReducer(stageReducer, null, () => initialStage(loadGap()));
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [preset, setPreset] = useState(() => loadPreset(event.id));
  const [colorOpen, setColorOpen] = useState(false);
  const [retry, setRetry] = useState(0);
  const presetRef = useRef(preset);
  presetRef.current = preset;
  const started = useRef(new Map<string, Promise<void>>());
  const busy = useRef(new Set<string>());

  // Dengar rana fotografer selama layar ini terbuka.
  useEffect(() => {
    if (!stage) return;
    stage
      .listen(true)
      .catch((e: unknown) => console.error(`[stage] dengar rana gagal: ${errText(e)}`));
    const off = stage.onShot((sh) => {
      dispatch({ type: "SHOT", shot: { ...sh, at: Date.now() }, id: newSessionId() });
      void p.storage
        .readFile(sh.path)
        .then((b) => renderJpeg(b, 480, "none", 0.8))
        .then((j) =>
          setThumbs((x) => ({
            ...x,
            [sh.path]: URL.createObjectURL(new Blob([j], { type: "image/jpeg" })),
          })),
        )
        .catch((e: unknown) => console.warn(`[stage] pratinjau gagal: ${errText(e)}`));
    });
    return () => {
      off();
      void stage.listen(false).catch(() => {});
    };
  }, [stage, p]);

  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "TICK", now: Date.now() }), 1000);
    return () => clearInterval(id);
  }, []);

  // Rombongan dengan foto pertama → sesi tercatat (nama grup ikut).
  useEffect(() => {
    for (const g of s.groups) {
      if (!g.shots.length || started.current.has(g.id)) continue;
      started.current.set(
        g.id,
        p.db.sessionStarted({
          id: g.id,
          eventId: event.id,
          layoutVersionId: "stage",
          startedAt: iso(g.startedAt),
          source: "stage",
          groupName: g.name,
        }),
      );
    }
  }, [s.groups, p, event.id]);

  const complete = useCallback(
    async (g: StageGroup) => {
      busy.current.add(g.id);
      setSaves((x) => ({ ...x, [g.id]: "saving" }));
      try {
        await started.current.get(g.id);
        const dir = await p.storage.sessionDir(g.id);
        const css = stagePresetCss(presetRef.current);
        const assets: SessionAsset[] = [];
        for (const [i, shot] of g.shots.entries()) {
          const raw = await p.storage.readFile(shot.path);
          for (const [kind, max, q] of [
            ["original", ORIGINAL_LONG_SIDE, 0.92],
            ["thumb_original", THUMB_LONG_SIDE, 0.85],
          ] as const) {
            const bytes = await renderJpeg(raw, max, css, q);
            const path = `${dir}/out/${kind}_${i + 1}.jpg`;
            await p.storage.writeFile(path, bytes);
            assets.push({ kind, idx: i + 1, path, bytes: bytes.length });
          }
        }
        await p.db.sessionCompleted({
          id: g.id,
          completedAt: iso(g.closedAt ?? Date.now()),
          photoCount: g.shots.length,
          retakeCount: 0,
          printCount: 0,
          assets,
        });
        setSaves((x) => ({ ...x, [g.id]: "saved" }));
      } catch (e) {
        console.error(`[stage] rombongan ${g.no} gagal disimpan: ${errText(e)}`);
        setSaves((x) => ({ ...x, [g.id]: "failed" }));
        busy.current.delete(g.id);
        setTimeout(() => setRetry((n) => n + 1), 5000);
      }
    },
    [p],
  );

  // Rombongan yang ditutup (tombol / jeda otomatis / batas foto) → proses & antre upload.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `retry` memicu percobaan ulang yang gagal
  useEffect(() => {
    for (const g of s.groups)
      if (g.closedAt !== null && !busy.current.has(g.id) && saves[g.id] !== "saved")
        void complete(g);
  }, [s.groups, complete, retry]);

  // Layar TV (#179): keadaan rombongan dikirim tiap berubah; status sambungan TV untuk operator.
  const [tvOn, setTvOn] = useState(false);
  useEffect(() => {
    const tv = stage?.tv;
    if (!tv) return;
    void tv.connected().then(setTvOn, () => {});
    return tv.onConnected(setTvOn);
  }, [stage]);
  useEffect(() => {
    stage?.tv.publish(
      tvState(s, {
        eventName: event.name,
        guestBaseUrl,
        filter: stagePresetCss(preset),
        activeSec: event.settings.qrScreenSec,
      }),
    );
  }, [s, preset, stage, event.name, event.settings.qrScreenSec, guestBaseUrl]);

  const newGroup = useCallback(
    () => dispatch({ type: "NEW_GROUP", id: newSessionId(), now: Date.now() }),
    [],
  );
  const togglePause = useCallback(
    () => dispatch({ type: s.paused ? "RESUME" : "PAUSE" }),
    [s.paused],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (colorOpen || (e.target as HTMLElement | null)?.tagName === "INPUT") return;
      if (e.key === "Enter") {
        e.preventDefault();
        newGroup();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [colorOpen, newGroup, togglePause]);

  const rename = (g: StageGroup, name: string) => {
    dispatch({ type: "RENAME", id: g.id, name });
    if (started.current.has(g.id))
      void started.current
        .get(g.id)
        ?.then(() => stage?.rename(g.id, name.trim() || null))
        .catch((e: unknown) => console.warn(`[stage] ganti nama gagal: ${errText(e)}`));
  };
  const setGap = (gapSec: number | null) => {
    localStorage.setItem(GAP_KEY, gapSec === null ? "off" : String(gapSec));
    dispatch({ type: "SET_GAP", gapSec });
  };
  const savePreset = (next: StagePreset) => {
    setPreset(next);
    localStorage.setItem(presetKey(event.id), JSON.stringify(next));
  };

  const cur = activeGroup(s);
  const qrGroup = cur?.shots.length ? cur : [...s.groups].reverse().find((g) => g.shots.length);
  const lastThumb = Object.values(thumbs).at(-1);
  const css = stagePresetCss(preset);
  const btn =
    "pressable flex h-[88px] items-center justify-center gap-3 rounded-2xl border-[2.5px] border-ink px-8 text-[28px] font-extrabold";

  return (
    <div className="flex h-full flex-col gap-6 p-10" data-testid="stage-runner">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-text-2">Photo Stage · {t.keys}</p>
          <h1 className="text-[40px] font-extrabold tracking-[-0.02em]">{event.name}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            data-testid="tv-status"
            className={`rounded-full border-[2.5px] border-ink px-4 py-1.5 text-xl font-bold ${tvOn ? "bg-mint-soft" : "bg-peach"}`}
          >
            {tvOn ? t.tvOn : t.tvOff}
          </span>
          <button
            type="button"
            onClick={() => setColorOpen(true)}
            className={`${btn} h-16 bg-white text-2xl`}
          >
            <SlidersHorizontal className="size-7" aria-hidden />
            {t.color}
          </button>
          <button type="button" onClick={onCrew} className={`${btn} h-16 bg-white text-2xl`}>
            <Settings className="size-7" aria-hidden />
            {t.crew}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-6">
        <section className="flex min-w-0 flex-1 flex-col gap-5 rounded-3xl border-[2.5px] border-ink bg-white p-8">
          {s.paused && (
            <div className="flex items-center justify-between rounded-2xl border-[2.5px] border-ink bg-peach px-6 py-4 text-2xl font-bold">
              <span>{s.loose.length ? t.loose(s.loose.length) : t.paused}</span>
              {!!s.loose.length && (
                <button
                  type="button"
                  className={`${btn} h-14 bg-butter text-xl`}
                  onClick={() =>
                    dispatch({ type: "ASSIGN_LOOSE", id: newSessionId(), now: Date.now() })
                  }
                >
                  {t.assignLoose}
                </button>
              )}
            </div>
          )}
          {cur ? (
            <>
              <div className="flex items-center gap-5">
                <span className="rounded-xl border-[2.5px] border-ink bg-mint px-4 py-1 text-3xl font-extrabold">
                  {t.group(cur.no)}
                </span>
                <input
                  aria-label={t.namePlaceholder}
                  placeholder={t.namePlaceholder}
                  value={cur.name ?? ""}
                  onChange={(e) => dispatch({ type: "RENAME", id: cur.id, name: e.target.value })}
                  onBlur={(e) => rename(cur, e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  className="h-16 flex-1 rounded-xl border-[2.5px] border-ink px-5 text-[28px] font-bold"
                />
              </div>
              <div className="grid min-h-0 flex-1 grid-cols-4 content-start gap-4 overflow-y-auto">
                {cur.shots.map((sh) => (
                  <div
                    key={sh.path}
                    className="aspect-[3/2] overflow-hidden rounded-xl border-2 border-ink bg-neutral"
                  >
                    {thumbs[sh.path] && (
                      <img
                        src={thumbs[sh.path]}
                        alt=""
                        style={{ filter: css }}
                        className="size-full object-cover"
                      />
                    )}
                  </div>
                ))}
              </div>
              {!cur.shots.length && <p className="text-2xl text-text-2">{t.waiting}</p>}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <p className="text-[34px] font-extrabold">{t.waiting}</p>
              <p className="max-w-[760px] text-2xl text-text-2">{t.waitingHint}</p>
            </div>
          )}
        </section>

        <aside className="flex w-[520px] flex-col gap-5">
          {qrGroup && (
            <div className="flex items-center gap-5 rounded-3xl border-[2.5px] border-ink bg-white p-5">
              <div className="rounded-xl bg-white p-2">
                <QrCode url={`${guestBaseUrl}/s/${qrGroup.id}`} size={170} />
              </div>
              <div className="min-w-0">
                <p className="text-xl font-bold text-text-2">{t.group(qrGroup.no)}</p>
                <p className="truncate text-2xl font-extrabold">{groupLabel(qrGroup)}</p>
              </div>
            </div>
          )}
          <div className="flex min-h-0 flex-1 flex-col rounded-3xl border-[2.5px] border-ink bg-white p-5">
            <p className="mb-3 text-xl font-bold text-text-2">{t.history}</p>
            <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto">
              {s.groups
                .filter((g) => g.closedAt !== null)
                .slice(-12)
                .reverse()
                .map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center gap-3 rounded-xl border-2 border-line-soft px-3 py-2"
                  >
                    <span className="w-14 text-xl font-extrabold">#{g.no}</span>
                    <input
                      key={`${g.id}:${g.name ?? ""}`}
                      aria-label={`${t.namePlaceholder} #${g.no}`}
                      defaultValue={g.name ?? ""}
                      placeholder={groupLabel(g)}
                      onBlur={(e) => e.target.value !== (g.name ?? "") && rename(g, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      className="min-w-0 flex-1 rounded-lg border-2 border-transparent px-2 text-xl font-semibold hover:border-line-soft focus:border-ink"
                    />
                    <span className="text-lg text-text-2">{t.photos(g.shots.length)}</span>
                    <span
                      className={`rounded-full border-2 border-ink px-2 text-sm font-bold ${saves[g.id] === "saved" ? "bg-mint-soft" : saves[g.id] === "failed" ? "bg-coral" : "bg-sky"}`}
                    >
                      {saves[g.id] === "saved"
                        ? t.saved
                        : saves[g.id] === "failed"
                          ? t.failed
                          : t.saving}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
        </aside>
      </div>

      <footer className="flex items-center gap-4">
        <button
          type="button"
          onClick={newGroup}
          className={`${btn} layered bg-butter [--lb:2.5px] [--lx:6px]`}
        >
          {t.newGroup} ⏎
        </button>
        <button
          type="button"
          onClick={togglePause}
          className={`${btn} ${s.paused ? "bg-mint" : "bg-white"}`}
        >
          {s.paused ? t.resume : t.pause}
        </button>
        <div className="ml-auto flex items-center gap-3 text-2xl font-bold">
          <span className="text-text-2">{t.auto}</span>
          <button
            type="button"
            aria-label="Kurangi"
            disabled={s.gapSec === null || s.gapSec <= STAGE_GAP.min}
            onClick={() => s.gapSec !== null && setGap(Math.max(STAGE_GAP.min, s.gapSec - 15))}
            className={`${btn} h-14 w-14 px-0 bg-white disabled:opacity-40`}
          >
            −
          </button>
          <span className="w-28 text-center">
            {s.gapSec === null ? t.autoOff : t.sec(s.gapSec)}
          </span>
          <button
            type="button"
            aria-label="Tambah"
            disabled={s.gapSec !== null && s.gapSec >= STAGE_GAP.max}
            onClick={() =>
              setGap(s.gapSec === null ? STAGE_GAP.default : Math.min(STAGE_GAP.max, s.gapSec + 15))
            }
            className={`${btn} h-14 w-14 px-0 bg-white disabled:opacity-40`}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setGap(s.gapSec === null ? STAGE_GAP.default : null)}
            className={`${btn} h-14 bg-white text-xl`}
          >
            {s.gapSec === null ? t.resume : t.autoOff}
          </button>
        </div>
      </footer>

      {colorOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/40">
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
                  onClick={() => setColorOpen(false)}
                  className={`${btn} layered h-16 flex-1 bg-butter text-2xl [--lb:2.5px] [--lx:6px]`}
                >
                  {t.done}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
