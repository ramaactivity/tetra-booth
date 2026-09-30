import { printPaper } from "@tetra/shared";
import { Button } from "@tetra/ui";
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  Focus,
  Heart,
  type LucideIcon,
  Printer,
  Settings,
  TriangleAlert,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { copy } from "../copy";
import { guestCursor } from "../cursorPref";
import { crewText, errText } from "../errors";
import { type BoothEvent, DEFAULT_EVENT } from "../event";
import { usePlatform } from "../PlatformContext";
import type { CrewStatus, FailedPrint, UpdateCheck } from "../platform";
import { sharpNotes } from "../sharpness";
import { Logo } from "../ui";
import { DeviceSheet } from "./DeviceSheet";
import { EventSettingsSheet } from "./EventSettingsSheet";
import { Sheet } from "./Sheet";
import { testPrint } from "./testPrint";

const PAPER_LOW = 30;
const DEFAULT_ROLL = 700;
const action = "min-h-[88px] rounded-[20px] px-6 py-3 text-2xl";
const small = "min-h-[72px] rounded-[18px] px-5 py-2 text-xl";

type Tone = "mint" | "sky" | "peach" | "lavender" | "coral" | "white";
const FILL: Record<Tone, string> = {
  mint: "var(--mint-soft)",
  sky: "var(--sky)",
  peach: "var(--peach)",
  lavender: "var(--lavender)",
  coral: "var(--coral)",
  white: "#fff",
};

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      style={{ background: FILL[tone] }}
      className="rounded-full border-2 border-ink px-4 py-1.5 text-lg font-bold whitespace-nowrap"
    >
      {children}
    </span>
  );
}

/** Kartu status saat event: judul + status, isi bebas, aksi di bawah (tanpa angka hero). */
function StatusCard({
  icon: Icon,
  title,
  pill,
  children,
}: {
  icon: LucideIcon;
  title: string;
  pill: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-[24px] border-[2.5px] border-ink bg-white p-7">
      <div className="flex items-center justify-between gap-4">
        <h3 className="flex items-center gap-3 text-2xl font-bold">
          <Icon size={26} strokeWidth={2} /> {title}
        </h3>
        {pill}
      </div>
      {children}
    </section>
  );
}

/** Sakelar berlabel: nama setelan di kiri, keadaan di kanan (bukan teks "Kursor: sembunyi" di tombol). */
function Toggle({
  label,
  on,
  onLabel,
  offLabel,
  onClick,
  testId,
}: {
  label: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      aria-pressed={on}
      onClick={onClick}
      className="pressable flex min-h-[80px] items-center justify-between gap-6 rounded-[20px] border-[2.5px] border-ink bg-paper px-6 text-left text-2xl font-bold"
    >
      {label}
      <span
        className={`rounded-full border-2 border-ink px-4 py-1.5 text-xl ${on ? "bg-mint" : "bg-white"}`}
      >
        {on ? onLabel : offLabel}
      </span>
    </button>
  );
}

/** Satu langkah checklist "Siapkan booth": nomor/centang, judul, keterangan, satu tombol. */
function Step({
  n,
  done,
  title,
  detail,
  action,
  onAction,
  testId,
  optional = false,
}: {
  n: number;
  done: boolean;
  optional?: boolean;
  title: string;
  detail: string;
  action: string;
  onAction: () => void;
  testId: string;
}) {
  return (
    <li
      data-testid={testId}
      data-done={done}
      className={`flex min-w-0 flex-col gap-3 rounded-[22px] border-[2.5px] border-ink p-5 ${done ? "bg-mint-soft" : "bg-white"}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-ink text-xl font-extrabold ${done ? "bg-green text-white" : "bg-butter"}`}
        >
          {done ? <Check size={22} strokeWidth={3} /> : n}
        </span>
        <h3 className="text-[22px] leading-tight font-bold">{title}</h3>
      </div>
      <p className="text-lg font-semibold text-text-2">
        {done && <strong className="text-ink">{copy.crew.setup.ready} · </strong>}
        {detail}
        {optional && !done && <span className="block">{copy.crew.setup.optional}</span>}
      </p>
      <Button
        variant={done ? "plain" : "secondary"}
        className="mt-auto min-h-[72px] rounded-[18px] px-5 py-2 text-xl"
        onClick={onAction}
      >
        {action}
      </Button>
    </li>
  );
}

const big = "text-[64px] leading-none font-extrabold tracking-[-0.03em]";
const sub = "mt-3 text-[22px] font-semibold text-text-2";
const link = "pressable flex min-h-12 items-center gap-2 font-bold";

/** Dashboard mode crew; lembar pilihan di atasnya (isi roll, update, kamera & printer, konfirmasi tutup). */
export function CrewMenu({
  event,
  onChangeEvent,
  onReloadEvents,
  onCameraCheck,
  onChangePin,
  onPair,
  onClose,
}: {
  event: BoothEvent;
  /** Ganti event lewat layar pilih mode (DECISIONS #86). */
  onChangeEvent: () => void;
  /** Muat ulang event aktif (setelah pengaturan event diubah di booth, #100). */
  onReloadEvents: () => Promise<void>;
  onCameraCheck: () => void;
  onChangePin: () => void;
  onPair: () => void;
  onClose: () => void;
}) {
  const p = usePlatform();
  const [status, setStatus] = useState<CrewStatus>();
  const [failed, setFailed] = useState<FailedPrint[]>([]);
  const [roll, setRoll] = useState<string | null>(null);
  const [sheet, setSheet] = useState<
    "roll" | "exit" | "update" | "device" | "settings" | "more" | null
  >(null);
  const [localSettings, setLocalSettings] = useState(false);
  const hasEvent = event.id !== DEFAULT_EVENT.id;
  useEffect(() => {
    if (!hasEvent) return;
    p.crew.eventSettings(event.id).then(
      (i) => setLocalSettings(Object.keys(i.override).length > 0),
      () => {},
    );
  }, [p, event, hasEvent]);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [blurWarn, setBlurWarn] = useState(() => sharpNotes.crewWarning());
  const [cursorOn, setCursorOn] = useState(guestCursor.shown);
  const [note, setNote] = useState<string>();
  /** Job test print / cetak ulang terakhir: hasil akhirnya menggantikan catatan "dikirim" (W-018). */
  const [, setWatching] = useState<string | null>(null);
  const [auto, setAuto] = useState<{ enabled: boolean; supported: boolean }>();
  useEffect(() => {
    p.crew.autoStart().then(setAuto, (e: unknown) => setNote(errText(e)));
  }, [p]);

  const refresh = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([p.crew.status(), p.crew.failedPrints()]);
      setStatus({ ...s, online: s.online && navigator.onLine });
      setFailed(f);
    } catch (e) {
      setNote(errText(e));
    }
  }, [p]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    const off = p.crew.onPrintUpdated((u) => {
      void refresh();
      setWatching((w) => {
        if (w === u.jobId)
          setNote(u.ok ? copy.crew.printed : copy.crew.printFailed(u.message ?? ""));
        return w === u.jobId ? null : w;
      });
    });
    return () => {
      clearInterval(t);
      off();
    };
  }, [p, refresh]);

  const [dl, setDl] = useState<{ received: number; total: number; eta: string } | null>(null);
  const [updErr, setUpdErr] = useState<string | null>(null);
  // Kemajuan unduhan update (#89): MB, persen, perkiraan sisa waktu dari kecepatan rata-rata.
  useEffect(() => {
    let t0 = 0;
    let r0 = 0;
    return p.crew.onUpdateProgress(({ received, total }) => {
      if (!t0) {
        t0 = Date.now();
        r0 = received;
      }
      const rate = (received - r0) / Math.max(1, (Date.now() - t0) / 1000);
      const left = rate > 0 ? (total - received) / rate : 0;
      const eta =
        left > 5
          ? ` · sisa ±${left < 90 ? `${Math.round(left)} dtk` : `${Math.round(left / 60)} menit`}`
          : "";
      setNote(
        copy.crew.updateProgress(
          Math.round(received / 1e6),
          Math.round(total / 1e6),
          Math.floor((received / total) * 100),
          eta,
        ),
      );
      setDl({ received, total, eta });
    });
  }, [p]);

  // Unduh + pasang dari sheet update: sheet tetap terbuka dengan progress bar; gagal = kotak merah + Coba Lagi.
  const installUpdate = () => {
    setUpdErr(null);
    setDl({ received: 0, total: 0, eta: "" });
    setNote(copy.crew.updating);
    p.crew.installUpdate().catch((e: unknown) => {
      setDl(null);
      setUpdErr(crewText(e));
      setNote(crewText(e));
    });
  };

  const act = (fn: () => Promise<unknown>, done?: string) => () =>
    fn()
      .then(() => {
        if (done) setNote(done);
        return refresh();
      })
      .catch((e: unknown) => setNote(crewText(e)));

  const printerTone: Tone =
    status?.printer.status === "ready"
      ? "mint"
      : status?.printer.status === "unknown"
        ? "white"
        : "coral";
  const act1 = (fn: () => Promise<unknown>, done?: string) => {
    setSheet(null);
    void act(fn, done)();
  };
  return (
    <main className="flex h-full w-full flex-col gap-8 overflow-y-auto bg-paper px-[72px] py-14 portrait:px-8">
      <header className="flex items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <Logo />
          <h1 className="rounded-full border-2 border-ink bg-lavender px-[18px] py-2 text-xl font-bold">
            {copy.crew.title}
          </h1>
        </div>
        <div className="flex items-center gap-4 rounded-[18px] border-[2.5px] border-ink bg-white px-[22px] py-3.5">
          <span className="flex size-11 items-center justify-center rounded-xl border-2 border-dashed border-ink bg-peach">
            <Heart size={20} fill="currentColor" />
          </span>
          <div>
            <div className="text-[15px] font-semibold text-text-2">{copy.crew.activeEvent}</div>
            <div className="text-[22px] font-extrabold">
              {event.name} — {copy.print.mode}
            </div>
            {localSettings && (
              <div
                data-testid="settings-local"
                className="mt-1 w-fit rounded-full border-2 border-ink bg-butter px-3 text-[15px] font-bold"
              >
                {copy.crew.changedHereBadge}
              </div>
            )}
          </div>
        </div>
      </header>
      {note && (
        <p
          className="rounded-[18px] border-2 border-dashed border-ink bg-sky px-6 py-4 text-xl font-semibold"
          role="status"
        >
          {note}
        </p>
      )}
      {blurWarn && (
        <div
          role="alert"
          className="flex items-center gap-6 rounded-[22px] border-[2.5px] border-ink bg-peach px-7 py-5"
        >
          <Focus size={30} strokeWidth={2.5} className="shrink-0" />
          <p className="flex-1 text-xl font-semibold">{copy.crew.blurWarn}</p>
          <Button
            variant="secondary"
            className="h-16 shrink-0 rounded-2xl px-5 text-xl"
            onClick={() => setSheet("device")}
          >
            {copy.crew.blurFix}
          </Button>
          <button
            type="button"
            className="shrink-0 text-xl font-bold underline"
            onClick={() => {
              sharpNotes.dismissWarning();
              setBlurWarn(false);
            }}
          >
            {copy.crew.blurDismiss}
          </button>
        </div>
      )}

      {/* Urutan kerja crew (masukan pengguna 30 Sep: alur crew membingungkan). */}
      <section
        aria-labelledby="setup-title"
        className="flex flex-col gap-5 rounded-[28px] border-[2.5px] border-ink bg-white p-8"
      >
        <div className="flex items-baseline gap-4">
          <h2 id="setup-title" className="text-[32px] font-extrabold">
            {copy.crew.setup.title}
          </h2>
          <p className="text-xl font-semibold text-text-2">{copy.crew.setup.sub}</p>
        </div>
        <ol className="grid grid-cols-5 gap-5 portrait:grid-cols-2">
          <Step
            n={1}
            optional
            testId="step-pair"
            done={!!status?.device}
            title={copy.crew.setup.pair}
            detail={
              status?.device
                ? copy.crew.paired(status.device.name, status.device.shortCode)
                : copy.crew.setup.pairTodo
            }
            action={copy.crew.setup.pairAction}
            onAction={onPair}
          />
          <Step
            n={2}
            testId="step-event"
            done={hasEvent}
            title={copy.crew.setup.event}
            detail={hasEvent ? event.name : copy.crew.setup.eventTodo}
            action={hasEvent ? copy.crew.setup.eventChange : copy.crew.setup.eventAction}
            onAction={onChangeEvent}
          />
          <Step
            n={3}
            testId="step-camera"
            done={!!status?.cameraService}
            title={copy.crew.setup.camera}
            detail={status?.cameraService ? copy.crew.setup.cameraOk : copy.crew.setup.cameraTodo}
            action={
              status?.cameraService ? copy.crew.setup.cameraAction : copy.crew.setup.pickDevice
            }
            onAction={status?.cameraService ? onCameraCheck : () => setSheet("device")}
          />
          <Step
            n={4}
            optional
            testId="step-printer"
            done={status?.printer.status === "ready"}
            title={copy.crew.setup.printer}
            detail={
              status?.printer.status === "ready"
                ? copy.crew.setup.printerOk
                : copy.crew.setup.printerTodo
            }
            action={
              status?.printer.status === "ready"
                ? copy.crew.setup.printerAction
                : copy.crew.setup.pickDevice
            }
            onAction={
              status?.printer.status === "ready"
                ? act(async () => setWatching(await testPrint(p, event)), copy.crew.sent)
                : () => setSheet("device")
            }
          />
          <li className="flex flex-col justify-end gap-3 portrait:col-span-2">
            <p className="text-lg font-semibold text-text-2">{copy.crew.setup.openHint}</p>
            <Button
              className="h-[120px] rounded-[22px] text-[28px] [--lx:7px] [--under:#fff]"
              onClick={onClose}
            >
              {copy.crew.setup.open} <ArrowRight size={28} strokeWidth={2.5} />
            </Button>
          </li>
        </ol>
      </section>

      {/* Saat event berlangsung: hanya yang sering dicek crew (kertas, kiriman foto, cetak gagal). */}
      <section aria-labelledby="live-title" className="flex flex-col gap-5">
        <h2 id="live-title" className="text-2xl font-extrabold">
          {copy.crew.duringEvent}
        </h2>
        <div className="grid grid-cols-3 gap-6 portrait:grid-cols-1">
          <StatusCard
            icon={Printer}
            title={copy.crew.printerTitle}
            pill={
              status && (
                <Pill tone={printerTone}>{copy.crew.printerState(status.printer.status)}</Pill>
              )
            }
          >
            <p className="text-[28px] font-extrabold">
              {status ? copy.crew.paper(status.paper.remaining, status.paper.capacity) : "…"}
            </p>
            {status && status.paper.remaining <= PAPER_LOW && (
              <p className="w-fit rounded-full border-2 border-ink bg-peach px-4 py-1.5 text-lg font-bold">
                {copy.crew.paperLow}
              </p>
            )}
            {status?.printer.message && (
              <p className="text-lg font-semibold text-text-2">{status.printer.message}</p>
            )}
            <div className="mt-auto grid grid-cols-2 gap-4 pt-2">
              <Button
                variant="secondary"
                className={small}
                onClick={() => {
                  setRoll(String(status?.paper.capacity ?? DEFAULT_ROLL));
                  setSheet("roll");
                }}
              >
                {copy.crew.newRoll}
              </Button>
              <Button
                variant="secondary"
                className={small}
                onClick={act(async () => setWatching(await testPrint(p, event)), copy.crew.sent)}
              >
                {copy.crew.testPrint}
              </Button>
            </div>
          </StatusCard>

          <StatusCard
            icon={ArrowUpDown}
            title={copy.crew.connection}
            pill={
              status && (
                <Pill tone={status.online ? "mint" : "peach"}>
                  {status.online ? copy.crew.online : copy.crew.offline}
                </Pill>
              )
            }
          >
            <p className="text-[28px] font-extrabold">
              {status?.uploadPending ? copy.crew.unsent(status.uploadPending) : copy.crew.allSent}
            </p>
            <p className="text-lg font-semibold text-text-2" data-testid="cloud-device">
              {status?.device
                ? copy.crew.paired(status.device.name, status.device.shortCode)
                : copy.crew.unpaired}
            </p>
            {status?.uploadError && (
              <p className="text-lg font-semibold text-text-2">{status.uploadError}</p>
            )}
            {!!status?.uploadPending && status.device && (
              <Button
                variant="secondary"
                className={`${small} mt-auto`}
                onClick={act(() => p.crew.retryUploads())}
              >
                {copy.crew.retryUpload}
              </Button>
            )}
          </StatusCard>

          <StatusCard
            icon={TriangleAlert}
            title={copy.crew.failedPrints}
            pill={<Pill tone={failed.length ? "coral" : "white"}>{failed.length}</Pill>}
          >
            {failed.length === 0 ? (
              <p className="text-[28px] font-extrabold">{copy.crew.none}</p>
            ) : (
              <ul className="flex max-h-[220px] flex-col overflow-y-auto">
                {failed.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-4 border-t-2 border-dashed border-ink py-3 first:border-0 first:pt-0"
                  >
                    <span className="min-w-0 text-lg font-semibold">
                      <span className="font-mono">
                        {new Date(f.createdAt).toLocaleTimeString("id-ID")}
                      </span>{" "}
                      · {f.copies}× · {f.error}
                      {f.error?.startsWith("print_uncertain") && (
                        <strong className="mt-1 block font-bold">{copy.crew.uncertain}</strong>
                      )}
                    </span>
                    <Button
                      variant="secondary"
                      className={`${small} shrink-0`}
                      onClick={act(
                        async () => setWatching(await p.crew.reprint(f.id)),
                        copy.crew.sent,
                      )}
                    >
                      {copy.crew.reprint}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </StatusCard>
        </div>
      </section>

      <footer className="flex items-center gap-6">
        <Button
          variant="secondary"
          className="h-[80px] rounded-[20px] px-8 text-2xl"
          onClick={() => setSheet("more")}
        >
          <Settings size={26} strokeWidth={2.25} /> {copy.crew.more}
        </Button>
        <p className="text-lg font-semibold text-text-2">{copy.crew.moreHint}</p>
      </footer>

      {sheet === "more" && (
        <Sheet title={copy.crew.more} onClose={() => setSheet(null)}>
          <div className="grid grid-cols-2 gap-4">
            <Button variant="plain" className={action} onClick={() => setSheet("device")}>
              {copy.crew.device}
            </Button>
            <Button
              variant="plain"
              className={action}
              disabled={!hasEvent}
              onClick={() => setSheet("settings")}
            >
              {copy.crew.eventSettings}
            </Button>
            <Button
              variant="plain"
              className={action}
              onClick={() => {
                setSheet(null);
                onChangePin();
              }}
            >
              {copy.crew.changePin}
            </Button>
            <Button
              variant="plain"
              className={action}
              onClick={() => {
                setUpdate(null);
                setSheet("update");
                p.crew.checkUpdate().then(setUpdate, (e: unknown) => {
                  setSheet(null);
                  setNote(crewText(e));
                });
              }}
            >
              {copy.crew.update}
            </Button>
          </div>
          <Toggle
            testId="guest-cursor"
            label={copy.crew.cursor}
            on={cursorOn}
            onLabel={copy.crew.cursorOn}
            offLabel={copy.crew.cursorOff}
            onClick={() => {
              guestCursor.set(!cursorOn);
              setCursorOn(!cursorOn);
            }}
          />
          {auto?.supported ? (
            <Toggle
              label={copy.crew.autoStart}
              on={auto.enabled}
              onLabel={copy.crew.on}
              offLabel={copy.crew.off}
              onClick={act(async () => setAuto(await p.crew.setAutoStart(!auto.enabled)))}
            />
          ) : (
            <p className="rounded-[18px] border-2 border-dashed border-ink px-6 py-4 text-lg font-semibold text-text-2">
              {auto ? copy.crew.autoStartDev : "…"}
            </p>
          )}
          <Button variant="destructive" className={action} onClick={() => setSheet("exit")}>
            {copy.crew.exit}
          </Button>
        </Sheet>
      )}

      {sheet === "roll" && roll !== null && (
        <Sheet title={copy.crew.newRoll} onClose={() => setSheet(null)}>
          <label className="flex flex-col gap-3 text-xl font-semibold text-text-2">
            {copy.crew.rollSize}
            <input
              inputMode="numeric"
              value={roll}
              onChange={(e) => setRoll(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-[92px] rounded-[20px] border-[2.5px] border-ink px-6 font-mono text-[40px] text-ink outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
            />
          </label>
          <Button
            className="h-[92px] rounded-[20px] text-[26px]"
            onClick={() =>
              act1(async () => {
                await p.crew.resetPaper(Number(roll));
                setRoll(null);
              })
            }
          >
            {copy.crew.save}
          </Button>
        </Sheet>
      )}
      {sheet === "device" && (
        <DeviceSheet
          paper={printPaper(event.layout.paper)}
          onNote={setNote}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === "settings" && (
        <EventSettingsSheet
          event={event}
          onNote={setNote}
          onSaved={onReloadEvents}
          onClose={() => setSheet(null)}
        />
      )}

      {sheet === "update" && (
        <Sheet title={copy.crew.update} onClose={() => setSheet(null)}>
          <p className="text-2xl font-medium text-text-2">
            {!update
              ? copy.crew.updateChecking
              : update.available && update.latest
                ? (update.ready ? copy.crew.updateReady : copy.crew.updateAvailable)(
                    update.latest,
                    update.current,
                  )
                : update.latest
                  ? copy.crew.updateLatest(update.current)
                  : copy.crew.updateNone}
          </p>
          {dl && (
            <div className="flex flex-col gap-3" data-testid="update-progress">
              <div className="h-8 overflow-hidden rounded-full border-[2.5px] border-ink bg-paper">
                <div
                  className="h-full bg-mint transition-[width] duration-500"
                  style={{ width: `${dl.total ? Math.floor((dl.received / dl.total) * 100) : 0}%` }}
                />
              </div>
              <p className="text-xl font-semibold" role="status">
                {dl.total && dl.received >= dl.total
                  ? copy.crew.updateInstalling
                  : dl.total
                    ? `${Math.floor((dl.received / dl.total) * 100)}% · ${Math.round(dl.received / 1e6)} / ${Math.round(dl.total / 1e6)} MB${dl.eta}`
                    : copy.crew.updating}
              </p>
            </div>
          )}
          {updErr && (
            <div
              className="rounded-[20px] border-[2.5px] border-ink bg-coral-strong px-6 py-4 text-xl font-semibold text-white"
              role="alert"
            >
              <b>{copy.crew.updateFailed}:</b> {updErr}
            </div>
          )}
          {update?.available && !dl && (
            <Button className="h-[92px] rounded-[20px] text-[26px]" onClick={installUpdate}>
              {updErr ? copy.crew.updateRetry : copy.crew.updateNow}
            </Button>
          )}
        </Sheet>
      )}

      {sheet === "exit" && (
        <Sheet title={copy.crew.exitConfirm} onClose={() => setSheet(null)}>
          <p className="text-2xl font-medium text-text-2">{copy.crew.exitBody}</p>
          <Button
            className="h-[92px] rounded-[20px] bg-coral-strong! text-[26px]"
            onClick={() => act1(() => p.crew.exit())}
          >
            {copy.crew.exitYes}
          </Button>
        </Sheet>
      )}
    </main>
  );
}
