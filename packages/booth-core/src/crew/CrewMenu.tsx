import type { EventBundle } from "@tetra/shared";
import { Button } from "@tetra/ui";
import {
  ArrowRight,
  ArrowUpDown,
  Camera,
  Heart,
  type LucideIcon,
  Printer,
  TriangleAlert,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useCallback, useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText, errText } from "../errors";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import type { CrewStatus, FailedPrint, UpdateCheck } from "../platform";
import { Logo } from "../ui";
import { testPrint } from "./testPrint";

const PAPER_LOW = 30;
const DEFAULT_ROLL = 700;
const action = "h-[92px] rounded-[20px] text-2xl";

type Tone = "mint" | "sky" | "peach" | "lavender" | "coral" | "white";
const FILL: Record<Tone, string> = {
  mint: "var(--mint-soft)",
  sky: "var(--sky)",
  peach: "var(--peach)",
  lavender: "var(--lavender)",
  coral: "var(--coral)",
  white: "#fff",
};

const dot = <span className="mr-1.5 inline-block size-2 rounded-full bg-ink align-middle" />;

function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      style={{ background: FILL[tone] }}
      className="rounded-full border-2 border-ink px-3.5 py-1.5 text-lg font-bold whitespace-nowrap"
    >
      {children}
    </span>
  );
}

/** Kartu status berlapis (A9b): ikon + judul + status, nilai besar, kaki dipisah garis putus-putus. */
function StatCard({
  icon: Icon,
  title,
  status,
  under,
  children,
  foot,
}: {
  icon: LucideIcon;
  title: string;
  status: ReactNode;
  under: Tone;
  children: ReactNode;
  foot?: ReactNode;
}) {
  return (
    <section
      style={{ "--under": FILL[under] } as CSSProperties}
      className="layered flex min-h-0 flex-col justify-between gap-4 rounded-[28px] border-[2.5px] border-ink bg-white p-8 [--lx:9px]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <span
            style={{ background: FILL[under] }}
            className="flex size-[52px] items-center justify-center rounded-[14px] border-2 border-dashed border-ink"
          >
            <Icon size={24} strokeWidth={2} />
          </span>
          <h2 className="text-2xl font-bold">{title}</h2>
        </div>
        {status}
      </div>
      <div className="min-h-0">{children}</div>
      {foot && (
        <div className="flex items-center justify-between border-t-2 border-dashed border-ink pt-[18px] text-[22px] font-bold">
          {foot}
        </div>
      )}
    </section>
  );
}

const big = "text-[64px] leading-none font-extrabold tracking-[-0.03em]";
const sub = "mt-3 text-[22px] font-semibold text-text-2";
const link = "pressable flex min-h-12 items-center gap-2 font-bold";

/** Lembar pilihan di atas dashboard (ganti event, isi roll, konfirmasi tutup). */
function Sheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-ink/30">
      <div className="layered flex max-h-[90%] w-[760px] flex-col gap-6 rounded-[28px] border-[2.5px] border-ink bg-white p-10 [--lx:10px]">
        <h2 className="text-[40px] font-extrabold tracking-[-0.02em]">{title}</h2>
        {children}
        <Button variant="plain" className="h-[92px] rounded-[20px] text-2xl" onClick={onClose}>
          {copy.crew.cancel}
        </Button>
      </div>
    </div>
  );
}

export function CrewMenu({
  event,
  bundles,
  activeId,
  onSelectEvent,
  onReloadEvents,
  onCameraCheck,
  onChangePin,
  onPair,
  onClose,
}: {
  event: BoothEvent;
  bundles: EventBundle[];
  activeId: string;
  onSelectEvent: (id: string) => void;
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
  const [sheet, setSheet] = useState<"events" | "roll" | "exit" | "update" | null>(null);
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
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
        {note && (
          <p
            className="truncate rounded-2xl border-2 border-dashed border-ink bg-sky px-5 py-3 text-xl font-semibold"
            role="status"
          >
            {note}
          </p>
        )}
        <div className="flex items-center gap-4 rounded-[18px] border-[2.5px] border-ink bg-white px-[22px] py-3.5">
          <span className="flex size-11 items-center justify-center rounded-xl border-2 border-dashed border-ink bg-peach">
            <Heart size={20} fill="currentColor" />
          </span>
          <div>
            <div className="text-[15px] font-semibold text-text-2">{copy.crew.activeEvent}</div>
            <div className="text-[22px] font-extrabold">
              {event.name} — {copy.print.mode}
            </div>
          </div>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-3 grid-rows-2 gap-8 portrait:grid-cols-1 portrait:grid-rows-none">
        <StatCard
          icon={Camera}
          title={copy.crew.camera}
          under="mint"
          status={
            status && (
              <Pill tone={status.cameraService ? "mint" : "coral"}>
                {dot}
                {status.cameraService ? copy.crew.connected : copy.crew.down}
              </Pill>
            )
          }
          foot={
            <>
              <span>{copy.crew.liveView}</span>
              <button type="button" className={link} onClick={onCameraCheck}>
                {copy.crew.testShot} <ArrowRight size={22} strokeWidth={2.5} />
              </button>
            </>
          }
        >
          <div className={big}>
            {status ? (status.cameraService ? copy.crew.ready : copy.crew.down) : "…"}
          </div>
          <div className={sub}>{copy.crew.cameraService}</div>
        </StatCard>

        <StatCard
          icon={Printer}
          title={copy.crew.printerTitle}
          under="sky"
          status={
            status && (
              <Pill tone={printerTone}>
                {dot}
                {copy.crew.printerState(status.printer.status)}
              </Pill>
            )
          }
          foot={
            <>
              <span
                className={status && status.paper.remaining <= PAPER_LOW ? "text-coral-strong" : ""}
              >
                {status ? copy.crew.paper(status.paper.remaining, status.paper.capacity) : "…"}
              </span>
              <button
                type="button"
                className={link}
                onClick={act(async () => setWatching(await testPrint(p, event)), copy.crew.sent)}
              >
                {copy.crew.testPrint} <ArrowRight size={22} strokeWidth={2.5} />
              </button>
            </>
          }
        >
          <div className={big}>±{status?.paper.remaining ?? "…"}</div>
          <div className={`${sub} truncate`}>
            {status && status.paper.remaining <= PAPER_LOW
              ? copy.crew.paperLow
              : copy.crew.sheetsLeft}
            {status?.printer.message && ` · ${status.printer.message}`}
          </div>
        </StatCard>

        <StatCard
          icon={ArrowUpDown}
          title={copy.crew.connection}
          under="peach"
          status={
            status && (
              <Pill tone={status.online ? "mint" : "peach"}>
                {dot}
                {status.online ? copy.crew.online : copy.crew.offline}
              </Pill>
            )
          }
          foot={
            <>
              <span className="truncate" data-testid="cloud-device">
                {status?.device
                  ? copy.crew.paired(status.device.name, status.device.shortCode)
                  : copy.crew.unpaired}
              </span>
              <button type="button" className={link} onClick={onPair}>
                {copy.crew.pair} <ArrowRight size={22} strokeWidth={2.5} />
              </button>
            </>
          }
        >
          <div className="flex items-center justify-between gap-4">
            <div className={big}>{copy.crew.files(status?.uploadPending ?? 0)}</div>
            {!!status?.uploadPending && status.device && (
              <button type="button" className={link} onClick={act(() => p.crew.retryUploads())}>
                {copy.crew.retryUpload}
              </button>
            )}
          </div>
          <div className={`${sub} truncate`}>{status?.uploadError ?? copy.crew.uploadQueue}</div>
        </StatCard>

        <StatCard
          icon={TriangleAlert}
          title={copy.crew.failedPrints}
          under="lavender"
          status={<Pill tone="white">{failed.length}</Pill>}
          foot={
            <>
              <span>{copy.crew.autoRefresh}</span>
              <span>{copy.crew.every5s}</span>
            </>
          }
        >
          {failed.length === 0 ? (
            <>
              <div className={big}>0</div>
              <div className={sub}>{copy.crew.none}</div>
            </>
          ) : (
            <ul className="flex max-h-[200px] flex-col overflow-y-auto">
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
                    className="h-16 shrink-0 rounded-2xl px-5 text-xl"
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
        </StatCard>

        <section className="col-span-2 grid grid-cols-5 content-center gap-5 rounded-[28px] border-[2.5px] border-ink bg-white p-8 portrait:col-span-1 portrait:grid-cols-2">
          <Button variant="plain" className={action} onClick={() => setSheet("events")}>
            {copy.crew.changeEvent}
          </Button>
          <Button
            variant="plain"
            className={action}
            onClick={() => {
              setRoll(String(status?.paper.capacity ?? DEFAULT_ROLL));
              setSheet("roll");
            }}
          >
            {copy.crew.newRoll}
          </Button>
          <Button
            variant="plain"
            className={action}
            onClick={act(() => p.crew.printerSettings(), copy.crew.printerSettingsDone)}
          >
            {copy.crew.printerSettings}
          </Button>
          <Button variant="plain" className={action} onClick={onChangePin}>
            {copy.crew.changePin}
          </Button>
          {auto?.supported ? (
            <Button
              variant="plain"
              className={action}
              onClick={act(async () => setAuto(await p.crew.setAutoStart(!auto.enabled)))}
            >
              {auto.enabled ? copy.crew.autoStartOn : copy.crew.autoStartOff}
            </Button>
          ) : (
            <p className="flex h-[92px] items-center justify-center rounded-[20px] border-[2.5px] border-dashed border-ink px-4 text-center text-lg font-semibold text-text-2">
              {auto ? copy.crew.autoStartDev : "…"}
            </p>
          )}
          <Button variant="destructive" className={action} onClick={() => setSheet("exit")}>
            {copy.crew.exit}
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
          <Button
            className="col-span-2 h-[92px] rounded-[20px] text-[26px] [--lx:7px] [--under:#fff] portrait:col-span-1"
            onClick={onClose}
          >
            {copy.crew.toGuest} <ArrowRight size={26} strokeWidth={2.5} />
          </Button>
        </section>
      </div>

      {sheet === "events" && (
        <Sheet title={copy.crew.changeEvent} onClose={() => setSheet(null)}>
          {status?.device && (
            <Button
              variant="secondary"
              className={action}
              onClick={act(async () => {
                setNote(copy.crew.syncing);
                const n = await p.crew.syncEvents();
                await onReloadEvents();
                setNote(copy.crew.synced(n));
              })}
            >
              {copy.crew.syncEvents}
            </Button>
          )}
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
            {[{ id: "local", name: copy.crew.defaultEvent, date: "" }, ...bundles].map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => {
                  setSheet(null);
                  onSelectEvent(b.id);
                }}
                className={`pressable flex min-h-[92px] items-center justify-between rounded-[20px] border-[2.5px] border-ink px-6 text-left text-2xl font-bold ${b.id === activeId ? "bg-mint-soft" : "bg-white"}`}
              >
                {b.name}
                {b.date && (
                  <span className="font-mono text-lg font-normal text-text-2">{b.date}</span>
                )}
              </button>
            ))}
          </div>
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
      {sheet === "update" && (
        <Sheet title={copy.crew.update} onClose={() => setSheet(null)}>
          <p className="text-2xl font-medium text-text-2">
            {!update
              ? copy.crew.updateChecking
              : update.available && update.latest
                ? copy.crew.updateAvailable(update.latest, update.current)
                : update.latest
                  ? copy.crew.updateLatest(update.current)
                  : copy.crew.updateNone}
          </p>
          {update?.available && (
            <Button
              className="h-[92px] rounded-[20px] text-[26px]"
              onClick={() => {
                setNote(copy.crew.updating);
                act1(() => p.crew.installUpdate());
              }}
            >
              {copy.crew.updateNow}
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
