import type { EventBundle } from "@tetra/shared";
import { Button } from "@tetra/ui";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Heart,
  Pencil,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { Logo } from "../ui";

type Mode = "event" | "photobox";
const t = copy.start;

/**
 * Layar awal (DECISIONS #86): pilih mode dulu (Event / Photobox), lalu event dengan mode itu.
 * Muncul saat app dibuka manual dan dari mode crew → Ganti Event.
 */
export function StartScreen({
  bundles,
  activeId,
  onPick,
  onSync,
  onCrew,
  onAdmin,
  onEditEvent,
  crewLabel = t.crew,
}: {
  bundles: EventBundle[];
  activeId: string;
  onPick: (id: string) => void;
  /** Ada = booth sudah dipasangkan & crew sudah masuk: tombol Ambil event terbaru. */
  onSync?: () => Promise<number>;
  /** Buka mode crew (PIN) dari layar awal. */
  onCrew: () => void;
  /** Ada = mode crew: tombol Edit per event cloud, buka pengaturan event itu di admin (browser). */
  onEditEvent?: (id: string) => void;
  /** Buka dashboard admin di browser (di luar mode crew: minta PIN dulu). */
  onAdmin?: () => void;
  /** Label tautan ke mode crew (dari mode crew: "Kembali ke Mode Crew"). */
  crewLabel?: string;
}) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState<string>();
  const of = (m: Mode) => bundles.filter((b) => (b.mode ?? "event") === m);
  // Event default (lokal) hanya untuk mode event.
  const list =
    mode === "event"
      ? [{ id: "local", name: copy.crew.defaultEvent, date: "" }, ...of("event")]
      : of("photobox");

  const sync = async () => {
    if (!onSync) return;
    setNote(copy.crew.syncing);
    try {
      setNote(copy.crew.synced(await onSync()));
    } catch (e) {
      setNote(errText(e));
    }
  };

  return (
    <main className="flex h-full w-full flex-col gap-10 bg-paper px-[72px] py-14 portrait:px-8">
      <header className="flex items-center justify-between gap-6">
        <Logo />
        <div className="flex items-center gap-8">
          {onAdmin && (
            <button
              type="button"
              className="flex items-center gap-2 rounded-2xl border-[2.5px] border-ink bg-white px-5 py-2.5 text-xl font-bold"
              onClick={onAdmin}
            >
              <ExternalLink size={20} strokeWidth={2.5} />
              {t.admin}
            </button>
          )}
          <button type="button" className="text-xl font-bold underline" onClick={onCrew}>
            {crewLabel}
          </button>
        </div>
      </header>

      {!mode ? (
        <section className="flex flex-1 flex-col justify-center gap-10">
          <div>
            <h1 className="text-[64px] font-extrabold tracking-[-0.03em]">{t.title}</h1>
            <p className="mt-2 text-2xl font-medium text-text-2">{t.sub}</p>
          </div>
          <div className="grid grid-cols-2 gap-8 portrait:grid-cols-1">
            {(
              [
                ["event", Heart, "var(--mint-soft)"],
                ["photobox", QrCode, "var(--butter)"],
              ] as const
            ).map(([m, Icon, fill]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="pressable layered flex min-h-[300px] flex-col justify-between gap-6 rounded-[32px] border-[2.5px] border-ink bg-white p-10 text-left [--lx:10px]"
              >
                <span
                  className="flex size-20 items-center justify-center rounded-[22px] border-[2.5px] border-ink"
                  style={{ background: fill }}
                >
                  <Icon size={40} strokeWidth={2.2} />
                </span>
                <span>
                  <span className="block text-[44px] font-extrabold tracking-[-0.02em]">
                    {t.mode[m]}
                  </span>
                  <span className="mt-2 block text-2xl font-medium text-text-2">
                    {t.modeSub[m]}
                  </span>
                </span>
                <span className="flex items-center justify-between text-xl font-bold">
                  {t.count(of(m).length + (m === "event" ? 1 : 0))}
                  <ArrowRight size={28} strokeWidth={2.5} />
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col gap-6">
          <div className="flex items-end justify-between gap-6">
            <div>
              <button
                type="button"
                className="flex items-center gap-2 text-xl font-bold underline"
                onClick={() => setMode(null)}
              >
                <ArrowLeft size={22} strokeWidth={2.5} /> {t.back}
              </button>
              <h1 className="mt-3 text-[56px] font-extrabold tracking-[-0.03em]">
                {t.mode[mode]} · {t.pickEvent}
              </h1>
            </div>
            {onSync && (
              <Button
                variant="secondary"
                className="h-[76px] rounded-[20px] px-6 text-xl"
                onClick={sync}
              >
                <RefreshCw size={24} strokeWidth={2.5} /> {copy.crew.syncEvents}
              </Button>
            )}
          </div>
          {note && <p className="text-xl font-semibold text-text-2">{note}</p>}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pb-2">
            {list.map((b) => (
              <div key={b.id} className="flex items-stretch gap-4">
                <button
                  type="button"
                  onClick={() => onPick(b.id)}
                  className={`pressable flex min-h-[104px] flex-1 items-center justify-between gap-6 rounded-[24px] border-[2.5px] border-ink px-8 text-left text-[30px] font-bold ${b.id === activeId ? "bg-mint-soft" : "bg-white"}`}
                >
                  {b.name}
                  {b.date && (
                    <span className="font-mono text-xl font-normal text-text-2">{b.date}</span>
                  )}
                </button>
                {onEditEvent && b.id !== "local" && (
                  <button
                    type="button"
                    data-testid={`edit-${b.id}`}
                    onClick={() => onEditEvent(b.id)}
                    className="pressable flex w-[150px] items-center justify-center gap-2 rounded-[24px] border-[2.5px] border-ink bg-white text-2xl font-bold"
                  >
                    <Pencil size={22} strokeWidth={2.5} />
                    {t.edit}
                  </button>
                )}
              </div>
            ))}
            {onEditEvent && list.some((b) => b.id !== "local") && (
              <p className="text-xl font-medium text-text-2">{t.editHint}</p>
            )}
            {onSync && <p className="text-xl font-medium text-text-2">{t.missingHint}</p>}
            {!list.length && (
              <p className="rounded-[24px] border-[2.5px] border-dashed border-ink px-8 py-10 text-2xl font-medium text-text-2">
                {t.empty}
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
