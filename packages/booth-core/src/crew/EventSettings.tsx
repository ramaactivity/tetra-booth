import { PHOTO_FILTERS } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { type ReactNode, useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import type { EventOverride, EventSettingsInfo } from "../platform";
import { btn, Panel, Row, ToggleRow } from "./parts";

type Key = keyof EventOverride;
type NumKey = {
  [K in Key]-?: NonNullable<EventOverride[K]> extends number ? K : never;
}[Key];
type FlagKey = "countdownSound" | "countdownVideo" | "bumper" | "pairDifferent";
/**
 * Batas sama dengan EventSettingsSchema; langkah besar untuk detik QR & timer sesi. `photobox` = hanya mode photobox,
 * `event` = hanya mode event (layar ngaca dilewati di photobox, #256).
 */
const FIELDS: {
  key: NumKey;
  min: number;
  max: number;
  step: number;
  photobox?: true;
  event?: true;
}[] = [
  { key: "mirrorSec", min: 0, max: 60, step: 5, event: true },
  { key: "countdownSec", min: 1, max: 10, step: 1 },
  { key: "retakeMax", min: 0, max: 5, step: 1 },
  { key: "maxPrints", min: 1, max: 10, step: 1 },
  // 0 = tidak dibatasi (bawaan mode event: crew standby yang melayani cetak ulang).
  { key: "reprintMax", min: 0, max: 20, step: 1, event: true },
  { key: "reviewTimeoutSec", min: 5, max: 120, step: 5 },
  { key: "qrScreenSec", min: 10, max: 300, step: 5 },
  { key: "sessionSec", min: 60, max: 900, step: 30, photobox: true },
];

/** Sakelar yang hanya berlaku di booth ini (#291). */
const FLAGS: FlagKey[] = ["countdownSound", "countdownVideo", "bumper", "pairDifferent"];
/** "Normal" selalu ada di langkah filter; yang dipilih crew = tambahannya. */
const FILTER_CHOICES = PHOTO_FILTERS.filter((f) => f.id !== "normal");
const PROMPT_MAX = 10;
const PROMPT_LEN = 40;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const KEYS: Key[] = [
  ...FIELDS.map((f) => f.key),
  ...FLAGS,
  "filters",
  "promptsBefore",
  "promptsAfter",
];

/** Batas cetak ulang 0 = tidak dibatasi. */
const shown = (key: Key, v: number) => (key === "reprintMax" && v === 0 ? copy.crew.unlimited : v);

const stepBtn =
  "pressable size-16 shrink-0 rounded-[14px] border-[2.5px] border-ink bg-white text-3xl font-bold disabled:opacity-30";

/**
 * Pengaturan event di booth (DECISIONS #100): override lokal per booth untuk field yang aman diubah di lokasi.
 * "Ambil event terbaru" tidak menimpanya; "Kembalikan ke cloud" menghapusnya. Template & harga tetap dari admin.
 * Panel langsung di halaman Event & Desain (bukan pop-up).
 */
export function EventSettings({
  event,
  onNote,
  onSaved,
}: {
  event: BoothEvent;
  onNote: (m: string) => void;
  /** Muat ulang event aktif supaya sesi berikutnya memakai nilai baru. */
  onSaved: () => Promise<void>;
}) {
  const p = usePlatform();
  const [info, setInfo] = useState<EventSettingsInfo>();
  const [draft, setDraft] = useState<EventOverride>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    p.crew.eventSettings(event.id).then(
      (i) => {
        setInfo(i);
        setDraft({ ...i.cloud, ...i.override });
      },
      (e: unknown) => onNote(crewText(e)),
    );
  }, [p, event.id, onNote]);

  const pb = !!event.photobox;
  const fields = FIELDS.filter((f) => (f.photobox ? pb : !(f.event && pb)));
  const now = info && { ...info.cloud, ...info.override };
  const changed = !!now && KEYS.some((k) => !same(draft[k], now[k]));
  const save = (next: EventOverride | null, done: string) => {
    setBusy(true);
    p.crew
      .setEventSettings(event.id, next)
      .then(async (i) => {
        setInfo(i);
        setDraft({ ...i.cloud, ...i.override });
        await onSaved();
        onNote(done);
      })
      .catch((e: unknown) => onNote(crewText(e)))
      .finally(() => setBusy(false));
  };
  const c = copy.crew;
  /** Nilai cloud + tanda "diubah di booth". */
  const hint = (key: Key, cloud: ReactNode, extra?: ReactNode) =>
    info && (
      <>
        {extra && <span className="mr-2">{extra}</span>}
        {c.cloudValue(cloud as string)}
        {key in info.override && (
          <span className="ml-2 rounded-full border-2 border-ink bg-butter px-3 text-base font-bold text-ink">
            {c.changedHere}
          </span>
        )}
      </>
    );

  return (
    <Panel title={c.eventSettings} hint={c.eventSettingsNote} testId="event-settings">
      {info && (
        <>
          <Group title={c.groups.session}>
            {fields.map(({ key, min, max, step }) => {
              const v = draft[key] ?? info.cloud[key];
              return (
                <Row
                  key={key}
                  testId={`setting-${key}`}
                  label={c.setting[key]}
                  hint={hint(key, shown(key, info.cloud[key]))}
                >
                  {/* Dibungkus: Row memberi tombol langsung min-w 240 px; stepper tetap kotak kecil. */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      aria-label={`${c.setting[key]} −`}
                      className={stepBtn}
                      disabled={v <= min}
                      onClick={() => setDraft((x) => ({ ...x, [key]: Math.max(min, v - step) }))}
                    >
                      −
                    </button>
                    <span className="w-24 text-center font-mono text-3xl font-bold">
                      {shown(key, v)}
                    </span>
                    <button
                      type="button"
                      aria-label={`${c.setting[key]} +`}
                      className={stepBtn}
                      disabled={v >= max}
                      onClick={() => setDraft((x) => ({ ...x, [key]: Math.min(max, v + step) }))}
                    >
                      +
                    </button>
                  </div>
                </Row>
              );
            })}
          </Group>

          <Group title={c.groups.media}>
            {FLAGS.map((key) => {
              const on = draft[key] ?? info.cloud[key];
              return (
                <ToggleRow
                  key={key}
                  testId={`setting-${key}`}
                  label={c.flag[key].title}
                  hint={hint(key, info.cloud[key] ? c.on : c.off, c.flag[key].hint)}
                  on={on}
                  onLabel={c.on}
                  offLabel={c.off}
                  onClick={() => setDraft((x) => ({ ...x, [key]: !on }))}
                />
              );
            })}
          </Group>

          <Group title={c.groups.filters} testId="setting-filters">
            <p className="text-lg font-medium text-text-2">
              {hint("filters", info.cloud.filters.length || c.listEmpty, c.filtersHint)}
            </p>
            <div className="flex flex-wrap gap-3">
              {FILTER_CHOICES.map((f) => {
                const list = draft.filters ?? info.cloud.filters;
                const on = list.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={on}
                    className={`pressable h-14 rounded-full border-[2.5px] border-ink px-6 text-xl font-bold ${on ? "bg-mint" : "bg-white text-text-2"}`}
                    onClick={() =>
                      setDraft((x) => {
                        const cur = x.filters ?? info.cloud.filters;
                        // Urutan mengikuti daftar filter, bukan urutan ketukan.
                        const next = on
                          ? cur.filter((id) => id !== f.id)
                          : FILTER_CHOICES.map((o) => o.id).filter(
                              (id) => id === f.id || cur.includes(id),
                            );
                        return { ...x, filters: next };
                      })
                    }
                  >
                    {on ? "✓ " : ""}
                    {f.label}
                  </button>
                );
              })}
            </div>
          </Group>

          {(["promptsBefore", "promptsAfter"] as const).map((key) => (
            <Group key={key} title={c.prompts[key].title} testId={`setting-${key}`}>
              <p className="text-lg font-medium text-text-2">
                {hint(key, info.cloud[key].length || c.listEmpty, c.prompts[key].hint)}
              </p>
              <PromptList
                label={c.prompts[key].title}
                items={draft[key] ?? info.cloud[key]}
                onChange={(next) => setDraft((x) => ({ ...x, [key]: next }))}
              />
            </Group>
          ))}
        </>
      )}
      <div className="flex flex-wrap justify-end gap-4">
        <Button
          variant="plain"
          className={btn}
          disabled={busy || !info || !Object.keys(info.override).length}
          onClick={() => save(null, c.eventSettingsReset)}
        >
          {c.resetToCloud}
        </Button>
        <Button
          className={`${btn} px-12`}
          disabled={busy || !changed}
          onClick={() => save(draft, c.eventSettingsSaved)}
        >
          {c.save}
        </Button>
      </div>
    </Panel>
  );
}

/** Kelompok setelan di dalam panel: judul kecil + isi. */
function Group({
  title,
  testId,
  children,
}: {
  title: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-testid={testId}
      className="flex flex-col gap-4 border-t-[2.5px] border-ink pt-5 first:border-0 first:pt-0"
    >
      <h3 className="text-[22px] font-extrabold tracking-[-0.01em]">{title}</h3>
      {children}
    </section>
  );
}

/** Daftar kalimat (maks. 10 × 40 huruf): hapus per baris, tambah lewat kolom ketik + tombol/Enter. */
function PromptList({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
}) {
  const [text, setText] = useState("");
  const add = () => {
    const t = text.trim();
    if (!t || items.length >= PROMPT_MAX) return;
    onChange([...items, t]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-3">
      {items.length > 0 && (
        <ol className="flex flex-col gap-2">
          {items.map((t, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: kalimat boleh kembar; urutan = identitas
              key={i}
              className="flex items-center justify-between gap-4 rounded-[16px] border-2 border-ink bg-paper py-2 pr-2 pl-5 text-xl font-semibold"
            >
              <span className="min-w-0 break-words">
                <span className="mr-3 font-mono text-text-2">{i + 1}.</span>
                {t}
              </span>
              <button
                type="button"
                aria-label={copy.crew.prompts.remove(t)}
                className="pressable flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-white text-2xl font-bold"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ol>
      )}
      {items.length < PROMPT_MAX && (
        <div className="flex items-center gap-3 pb-1.5">
          <input
            aria-label={copy.crew.prompts.newLabel(label)}
            value={text}
            maxLength={PROMPT_LEN}
            placeholder={copy.crew.prompts.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="h-16 min-w-0 flex-1 rounded-[16px] border-[2.5px] border-ink bg-white px-5 text-xl font-semibold text-ink outline-none placeholder:text-muted focus:shadow-[0_0_0_3px_var(--mint)]"
          />
          <Button className={btn} disabled={!text.trim()} onClick={add}>
            {copy.crew.prompts.add}
          </Button>
        </div>
      )}
    </div>
  );
}
