import { Button } from "@tetra/ui";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import type { EventOverride, EventSettingsInfo } from "../platform";
import { btn, Panel, Row } from "./parts";

type Key = keyof EventOverride;
/** Batas sama dengan EventSettingsSchema; langkah besar untuk detik QR & timer sesi. */
const FIELDS: { key: Key; min: number; max: number; step: number; photobox?: true }[] = [
  { key: "countdownSec", min: 1, max: 10, step: 1 },
  { key: "retakeMax", min: 0, max: 5, step: 1 },
  { key: "maxPrints", min: 1, max: 10, step: 1 },
  { key: "qrScreenSec", min: 10, max: 300, step: 5 },
  { key: "sessionSec", min: 60, max: 900, step: 30, photobox: true },
];

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

  const fields = FIELDS.filter((f) => !f.photobox || event.photobox);
  const now = info && { ...info.cloud, ...info.override };
  const changed = !!now && fields.some((f) => draft[f.key] !== now[f.key]);
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

  return (
    <Panel
      title={copy.crew.eventSettings}
      hint={copy.crew.eventSettingsNote}
      testId="event-settings"
    >
      <div className="flex flex-col gap-4">
        {info &&
          fields.map(({ key, min, max, step }) => {
            const v = draft[key] ?? info.cloud[key];
            const local = key in info.override;
            return (
              <Row
                key={key}
                testId={`setting-${key}`}
                label={copy.crew.setting[key]}
                hint={
                  <>
                    {copy.crew.cloudValue(info.cloud[key])}
                    {local && (
                      <span className="ml-2 rounded-full border-2 border-ink bg-butter px-3 text-base font-bold text-ink">
                        {copy.crew.changedHere}
                      </span>
                    )}
                  </>
                }
              >
                <button
                  type="button"
                  aria-label={`${copy.crew.setting[key]} −`}
                  className={stepBtn}
                  disabled={v <= min}
                  onClick={() => setDraft((x) => ({ ...x, [key]: Math.max(min, v - step) }))}
                >
                  −
                </button>
                <span className="w-24 text-center font-mono text-3xl font-bold">{v}</span>
                <button
                  type="button"
                  aria-label={`${copy.crew.setting[key]} +`}
                  className={stepBtn}
                  disabled={v >= max}
                  onClick={() => setDraft((x) => ({ ...x, [key]: Math.min(max, v + step) }))}
                >
                  +
                </button>
              </Row>
            );
          })}
      </div>
      <div className="flex flex-wrap justify-end gap-4">
        <Button
          variant="plain"
          className={btn}
          disabled={busy || !info || !Object.keys(info.override).length}
          onClick={() => save(null, copy.crew.eventSettingsReset)}
        >
          {copy.crew.resetToCloud}
        </Button>
        <Button
          className={`${btn} px-12`}
          disabled={busy || !changed}
          onClick={() => save(draft, copy.crew.eventSettingsSaved)}
        >
          {copy.crew.save}
        </Button>
      </div>
    </Panel>
  );
}
