import { type EventBundle, type LayoutSpec, paperLabel } from "@tetra/shared";
import { dateVars } from "@tetra/template-engine";
import { Button } from "@tetra/ui";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Heart,
  Pencil,
  QrCode,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { DEFAULT_EVENT } from "../event";
import { Logo } from "../ui";
import { DesignThumb } from "./DesignThumb";

type Mode = "event" | "photobox";
type Row = Pick<EventBundle, "id" | "name" | "date" | "layout" | "designs" | "photobox">;
const t = copy.start;

type Sort = "newest" | "soonest" | "name";
const iso = (b: Row) => (b.date ? dateVars(b.date).date_iso : "");
/** Urutan daftar event (#242): bawaan acara terbaru di atas; event default bawaan selalu paling bawah. */
const sorted = (rows: Row[], sort: Sort, today: string) =>
  [...rows].sort((a, b) => {
    if (a.id === "local" || b.id === "local") return a.id === "local" ? 1 : -1;
    if (sort === "name") return a.name.localeCompare(b.name, "id");
    const x = iso(a);
    const y = iso(b);
    if (!x || !y) return x ? -1 : y ? 1 : 0;
    if (sort === "newest") return y.localeCompare(x);
    // Terdekat: yang akan datang paling dekat dulu, lalu yang sudah lewat (terbaru dulu).
    const ax = x >= today;
    const by = y >= today;
    return ax !== by ? (ax ? -1 : 1) : ax ? x.localeCompare(y) : y.localeCompare(x);
  });
/** Layout desain event yang punya gambar (overlay/latar dari klien); kosong = belum ada desain. */
const layoutsOf = (b: Row): LayoutSpec[] =>
  b.photobox
    ? b.photobox.layouts.map((l) => l.layout)
    : b.designs
      ? b.designs.map((d) => d.layout)
      : [b.layout];
const hasArt = (l: LayoutSpec) => !!(l.overlay?.assetId || l.background?.assetId);

/** Urutan persiapan crew; `at` = langkah yang sedang dikerjakan di layar ini. */
function SetupSteps({ at }: { at: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xl font-bold">
      {t.steps.map((label, i) => (
        <li key={label} className="flex items-center gap-3">
          {i > 0 && <span className="w-8 border-t-[2.5px] border-dashed border-ink" />}
          <span
            className={`flex size-9 items-center justify-center rounded-full border-2 border-ink ${i === at ? "bg-ink text-white" : i < at ? "bg-mint-soft" : "bg-white"}`}
          >
            {i + 1}
          </span>
          <span className={i === at ? "" : "text-text-2"}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

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
  const [sort, setSort] = useState<Sort>("newest");
  const today = new Date().toISOString().slice(0, 10);
  const [note, setNote] = useState<string>();
  const of = (m: Mode) => bundles.filter((b) => (b.mode ?? "event") === m);
  // Event default (lokal) hanya untuk mode event.
  const list: Row[] =
    mode === "event"
      ? [
          { id: "local", name: copy.crew.defaultEvent, date: "", layout: DEFAULT_EVENT.layout },
          ...of("event"),
        ]
      : of("photobox");
  const empty = !!mode && !of(mode).length;

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
          {/* Tombol jelas (masukan Rama 9 Okt), bukan tautan teks. */}
          <button
            type="button"
            data-testid="to-crew"
            className="pressable layered flex items-center gap-2.5 rounded-2xl border-[2.5px] border-ink bg-lavender px-6 py-3 text-xl font-extrabold [--lb:2.5px] [--lx:5px]"
            onClick={onCrew}
          >
            <ArrowLeft size={22} strokeWidth={2.75} />
            {crewLabel}
          </button>
        </div>
      </header>
      <SetupSteps at={mode ? 1 : 0} />

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
                    {t.modeWhen[m]}
                  </span>
                  <span className="mt-3 block text-2xl font-bold">{t.modeNext[m]}</span>
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
                className="pressable flex items-center gap-2 rounded-2xl border-2 border-ink bg-white px-4 py-2 text-xl font-bold"
                onClick={() => setMode(null)}
              >
                <ArrowLeft size={22} strokeWidth={2.5} /> {t.back}
              </button>
              <h1 className="mt-3 text-[56px] font-extrabold tracking-[-0.03em]">
                {t.mode[mode]} · {t.pickEvent}
              </h1>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-4">
              <fieldset
                aria-label={t.sortLabel}
                className="m-0 flex min-w-0 overflow-hidden rounded-[18px] border-[2.5px] border-ink bg-white p-0"
              >
                {(["newest", "soonest", "name"] as const).map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={sort === k}
                    onClick={() => setSort(k)}
                    className={`h-[68px] px-5 text-xl font-bold ${sort === k ? "bg-ink text-white" : ""} ${i ? "border-l-[2.5px] border-ink" : ""}`}
                  >
                    {t.sort[k]}
                  </button>
                ))}
              </fieldset>
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
          </div>
          {note && <p className="text-xl font-semibold text-text-2">{note}</p>}
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pb-2">
            <ul className="grid grid-cols-2 gap-5 portrait:grid-cols-1">
              {sorted(list, sort, today).map((b) => {
                const local = b.id === "local";
                const layouts = layoutsOf(b);
                const art = layouts.filter(hasArt).length;
                const active = b.id === activeId;
                const d = iso(b);
                return (
                  <li
                    key={b.id}
                    data-testid={`event-${b.id}`}
                    className={`layered relative rounded-[28px] border-[2.5px] border-ink [--lb:2.5px] [--lx:6px] ${active ? "bg-mint-soft" : "bg-white"}`}
                  >
                    <button
                      type="button"
                      onClick={() => onPick(b.id)}
                      className="flex w-full items-stretch gap-6 p-5 pr-6 text-left"
                    >
                      <span
                        aria-hidden
                        className="flex h-[210px] w-[160px] shrink-0 items-center justify-center rounded-[16px] bg-neutral p-2"
                      >
                        <span className="block h-full max-w-full overflow-hidden rounded-[6px] border-2 border-ink">
                          <DesignThumb eventId={b.id} layout={b.layout} />
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-2.5 py-1">
                        {active && (
                          <span className="self-start rounded-full border-2 border-ink bg-mint px-3 py-0.5 text-base font-extrabold">
                            {t.active}
                          </span>
                        )}
                        <span className="line-clamp-2 text-[28px] leading-tight font-extrabold tracking-[-0.02em]">
                          {b.name}
                        </span>
                        {b.date && (
                          <span className="font-mono text-xl text-text-2">
                            {b.date}
                            {d && d >= today && d === today ? ` · ${t.today}` : ""}
                          </span>
                        )}
                        <span className="mt-auto flex flex-wrap gap-2">
                          <span className="rounded-full border-2 border-ink bg-white px-3 py-1 text-base font-bold">
                            {paperLabel(b.layout.paper, b.layout.canvas)}
                          </span>
                          {local ? (
                            <span className="rounded-full border-2 border-ink bg-white px-3 py-1 text-base font-bold">
                              {t.defaultDesign}
                            </span>
                          ) : art ? (
                            <span className="rounded-full border-2 border-ink bg-lavender px-3 py-1 text-base font-bold">
                              {b.photobox ? t.layouts(layouts.length) : t.designs(layouts.length)}
                            </span>
                          ) : (
                            <span
                              data-testid={`no-design-${b.id}`}
                              className="flex items-center gap-1.5 rounded-full border-2 border-ink bg-coral px-3 py-1 text-base font-extrabold"
                            >
                              <TriangleAlert size={18} strokeWidth={2.5} />
                              {t.noDesign}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                    {onEditEvent && !local && (
                      <button
                        type="button"
                        data-testid={`edit-${b.id}`}
                        onClick={() => onEditEvent(b.id)}
                        className="pressable absolute top-4 right-4 flex items-center gap-1.5 rounded-xl border-2 border-ink bg-white px-3 py-1.5 text-lg font-bold"
                      >
                        <Pencil size={18} strokeWidth={2.5} />
                        {t.edit}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {onEditEvent && list.some((b) => b.id !== "local") && (
              <p className="text-xl font-medium text-text-2">{t.editHint}</p>
            )}
            {empty ? (
              <p className="rounded-[24px] border-[2.5px] border-dashed border-ink px-8 py-8 text-2xl font-medium text-text-2">
                {t.empty}
                {!onSync && <span className="mt-2 block font-bold text-ink">{t.emptyCrew}</span>}
              </p>
            ) : (
              onSync && <p className="text-xl font-medium text-text-2">{t.missingHint}</p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
