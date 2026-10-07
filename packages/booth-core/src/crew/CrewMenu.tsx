import { paperLabel, printPaper, type RunAction } from "@tetra/shared";
import { Button } from "@tetra/ui";
import {
  ArrowRight,
  ArrowUpDown,
  Camera,
  Check,
  ClipboardList,
  Flag,
  Focus,
  Heart,
  LayoutGrid,
  type LucideIcon,
  Palette,
  Pause,
  Play,
  Printer,
  Settings,
  TriangleAlert,
} from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { copy } from "../copy";
import { guestCursor } from "../cursorPref";
import { eventDesigns } from "../designEdit";
import { crewText, errText } from "../errors";
import { type BoothEvent, DEFAULT_EVENT } from "../event";
import { usePlatform } from "../PlatformContext";
import type { BoothRunState, CrewStatus, FailedPrint, UpdateCheck } from "../platform";
import { type SharpenProgress, sharpenOldSessions } from "../rerender";
import { sharpNotes } from "../sharpness";
import { Logo } from "../ui";
import { BoothRecap } from "./BoothRecap";
import { CameraProps } from "./CameraProps";
import { DeviceSheet } from "./DeviceSheet";
import { EventSettingsSheet } from "./EventSettingsSheet";
import { PrintToneCard } from "./PrintTone";
import { Sheet } from "./Sheet";
import { StartDialog } from "./StartDialog";
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

type Section = "home" | "camera" | "printer" | "event" | "system";
const SECTIONS: { id: Section; icon: LucideIcon }[] = [
  { id: "home", icon: LayoutGrid },
  { id: "camera", icon: Camera },
  { id: "printer", icon: Printer },
  { id: "event", icon: Palette },
  { id: "system", icon: Settings },
];

/** Ubin status ringkas di Ringkasan; diketuk = buka bagiannya. */
function Tile({
  icon: Icon,
  title,
  pill,
  under,
  onOpen,
  children,
}: {
  icon: LucideIcon;
  title: string;
  pill: ReactNode;
  under: Tone;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ "--under": FILL[under] } as CSSProperties}
      className="pressable layered flex min-w-0 flex-col gap-4 rounded-[26px] border-[2.5px] border-ink bg-white p-6 text-left [--lx:8px]"
    >
      <span className="flex w-full items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span
            style={{ background: FILL[under] }}
            className="flex size-11 items-center justify-center rounded-[12px] border-2 border-dashed border-ink"
          >
            <Icon size={22} strokeWidth={2} />
          </span>
          <span className="text-xl font-bold">{title}</span>
        </span>
        {pill}
      </span>
      <span className="block min-w-0">{children}</span>
    </button>
  );
}

/** Kelompok aksi berjudul dalam satu bagian; `column` = isi bebas (daftar, setelan). */
function Group({
  title,
  pill,
  column = false,
  children,
}: {
  title: string;
  pill?: ReactNode;
  column?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-[26px] border-[2.5px] border-ink bg-white p-7">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">{title}</h2>
        {pill}
      </div>
      <div
        className={column ? "flex flex-col gap-4" : "grid grid-cols-4 gap-5 portrait:grid-cols-2"}
      >
        {children}
      </div>
    </section>
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
  /** Kosong = langkah beres tanpa aksi lanjutan (tidak menampilkan tombol yang terlihat seperti tugas). */
  action?: string | undefined;
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
      {action && (
        <Button
          variant={done ? "plain" : "secondary"}
          className="mt-auto min-h-[72px] rounded-[18px] px-5 py-2 text-xl"
          onClick={onAction}
        >
          {action}
        </Button>
      )}
    </li>
  );
}

const big = "block text-[44px] leading-none font-extrabold tracking-[-0.03em]";
const sub = "mt-2 block text-lg font-semibold text-text-2";

/**
 * Dashboard mode crew: menu samping (Ringkasan · Kamera · Printer · Event & Desain · Sistem, masukan Rama W-034),
 * lembar pilihan di atasnya (isi roll, update, kamera & printer, pengaturan event, konfirmasi tutup).
 */
export function CrewMenu({
  event,
  guestBaseUrl,
  startExit = false,
  onChangeEvent,
  onEditDesign,
  onReloadEvents,
  onCameraCheck,
  onChangePin,
  onPair,
  onClose,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  /** Buka langsung konfirmasi Tutup Aplikasi (Ctrl+Shift+Q). */
  startExit?: boolean;
  /** Ganti event lewat layar pilih mode (DECISIONS #86). */
  onChangeEvent: () => void;
  /** Buka editor desain di booth untuk satu layout.id (DECISIONS #131). */
  onEditDesign: (layoutId: string) => void;
  /** Muat ulang event aktif (setelah pengaturan event diubah di booth, #100). */
  onReloadEvents: () => Promise<void>;
  onCameraCheck: () => void;
  onChangePin: () => void;
  onPair: () => void;
  /** `live` = tamu sungguhan, `test` = Tes dulu (sesi ditandai tes, #153); kosong = mode tidak berubah. */
  onClose: (mode?: "live" | "test") => void;
}) {
  const p = usePlatform();
  const [status, setStatus] = useState<CrewStatus>();
  const [failed, setFailed] = useState<FailedPrint[]>([]);
  const [roll, setRoll] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"roll" | "exit" | "update" | "device" | "settings" | null>(
    startExit ? "exit" : null,
  );
  const [localSettings, setLocalSettings] = useState(false);
  const hasEvent = event.id !== DEFAULT_EVENT.id;
  useEffect(() => {
    if (!hasEvent) return;
    p.crew.eventSettings(event.id).then(
      (i) => setLocalSettings(Object.keys(i.override).length > 0),
      () => {},
    );
  }, [p, event, hasEvent]);
  // Desain yang diedit di booth: layout.id → waktu simpan (#131).
  const [localDesigns, setLocalDesigns] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!hasEvent) return;
    p.crew.designs(event.id).then(setLocalDesigns, () => {});
  }, [p, event, hasEvent]);
  const hhmm = (iso: string) =>
    new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  // Timer event (#149): null = event lokal (tanpa cloud), tidak ditampilkan.
  const [run, setRun] = useState<BoothRunState | null>(null);
  const [finishAsk, setFinishAsk] = useState(false);
  /** Pop-up Mulai acara / Tes dulu (#152) dan kartu rekap (#154). */
  const [goAsk, setGoAsk] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  useEffect(() => {
    if (!hasEvent) return;
    p.crew.runState(event.id).then(setRun, () => {});
  }, [p, event, hasEvent]);
  const runAct = (a: RunAction | "arm") =>
    p.crew.eventRun(event.id, a).then(
      (s) => {
        setFinishAsk(false);
        setRun(s);
        if (!status?.online && a !== "arm") setNote(copy.crew.run.offline);
      },
      (e: unknown) => setNote(crewText(e)),
    );
  /**
   * Buka untuk Tamu (#152): acara belum mulai / dijeda / sudah dihentikan (#170) = tanya Mulai/Lanjutkan acara atau
   * Tes dulu. Berjalan, menunggu sesi pertama, atau event lokal = langsung buka. Timer tidak pernah menunggu jaringan.
   */
  const openForGuests = () => {
    if (hasEvent && (run === "idle" || run === "paused" || run === "finished")) setGoAsk(true);
    else onClose("live");
  };
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

  // Tajamkan foto lama (#140): jalan selama menu crew terbuka; menutup menu = batal.
  const [sharpen, setSharpen] = useState<(SharpenProgress & { running: boolean }) | null>(null);
  const stopSharpen = useRef<AbortController | null>(null);
  useEffect(() => () => stopSharpen.current?.abort(), []);
  const startSharpen = () => {
    const ac = new AbortController();
    stopSharpen.current = ac;
    setSharpen({ total: 0, done: 0, updated: 0, mismatch: 0, skipped: 0, running: true });
    sharpenOldSessions(p, guestBaseUrl, (x) => setSharpen({ ...x, running: true }), ac.signal)
      .then((x) => setSharpen({ ...x, running: false }))
      .catch((e: unknown) => {
        setSharpen(null);
        setNote(crewText(e));
      });
  };

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
  const [section, setSection] = useState<Section>("home");
  const modeLabel = event.photobox ? copy.start.mode.photobox : copy.start.mode.event;
  const paperLow = !!status && status.paper.remaining <= PAPER_LOW;
  const openRoll = () => {
    setRoll(String(status?.paper.capacity ?? DEFAULT_ROLL));
    setSheet("roll");
  };
  const openUpdate = () => {
    setUpdate(null);
    setSheet("update");
    p.crew.checkUpdate().then(setUpdate, (e: unknown) => {
      setSheet(null);
      setNote(crewText(e));
    });
  };
  const doTestPrint = act(async () => setWatching(await testPrint(p, event)), copy.crew.sent);

  const cameraPill = status && (
    <Pill tone={status.cameraService ? "mint" : "coral"}>
      {dot}
      {status.cameraService ? copy.crew.connected : copy.crew.down}
    </Pill>
  );
  const printerPill = status && (
    <Pill tone={printerTone}>
      {dot}
      {copy.crew.printerState(status.printer.status)}
    </Pill>
  );
  const revoked = !!status?.device?.revoked;
  const onlinePill = status && (
    <Pill tone={revoked ? "coral" : status.online ? "mint" : "peach"}>
      {dot}
      {revoked ? copy.crew.revokedPill : status.online ? copy.crew.online : copy.crew.offline}
    </Pill>
  );

  const failedList =
    failed.length === 0 ? (
      <p className="text-xl font-semibold text-text-2">{copy.crew.none}</p>
    ) : (
      <ul className="flex flex-col">
        {failed.map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-4 border-t-2 border-dashed border-ink py-3 first:border-0 first:pt-0"
          >
            <span className="min-w-0 text-lg font-semibold">
              <span className="font-mono">{new Date(f.createdAt).toLocaleTimeString("id-ID")}</span>{" "}
              · {f.copies}× · {f.error}
              {f.error?.startsWith("print_uncertain") && (
                <strong className="mt-1 block font-bold">{copy.crew.uncertain}</strong>
              )}
            </span>
            <Button
              variant="secondary"
              className="h-14 shrink-0 rounded-2xl px-5 text-xl"
              onClick={act(async () => setWatching(await p.crew.reprint(f.id)), copy.crew.sent)}
            >
              {copy.crew.reprint}
            </Button>
          </li>
        ))}
      </ul>
    );

  const content: Record<Section, ReactNode> = {
    home: (
      <>
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
              action={status?.device ? undefined : copy.crew.setup.pairAction}
              onAction={onPair}
            />
            <Step
              n={2}
              testId="step-event"
              done={hasEvent}
              title={copy.crew.setup.event}
              detail={
                hasEvent
                  ? `${event.name} · ${paperLabel(event.layout.paper, event.layout.canvas)}`
                  : copy.crew.setup.eventTodo
              }
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
                data-testid="open-guests"
                onClick={openForGuests}
              >
                {copy.crew.setup.open} <ArrowRight size={28} strokeWidth={2.5} />
              </Button>
            </li>
          </ol>
        </section>
        {run && (
          <section
            data-testid="crew-run"
            data-state={run}
            className="flex flex-wrap items-center gap-x-8 gap-y-5 rounded-[26px] border-[2.5px] border-ink bg-white px-7 py-6"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold">{copy.crew.run.title}</h2>
                <Pill
                  tone={
                    run === "running"
                      ? "mint"
                      : run === "paused"
                        ? "peach"
                        : run === "finished"
                          ? "sky"
                          : run === "waiting"
                            ? "lavender"
                            : "white"
                  }
                >
                  {dot}
                  {copy.crew.run.state[run]}
                </Pill>
              </div>
              <p className="text-lg font-semibold text-text-2">
                {finishAsk ? copy.crew.run.confirm : copy.crew.run[run]}
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              {finishAsk ? (
                <>
                  <Button
                    variant="plain"
                    className="h-[80px] rounded-[20px] px-8 text-xl"
                    onClick={() => setFinishAsk(false)}
                  >
                    {copy.crew.run.cancel}
                  </Button>
                  <Button
                    variant="destructive"
                    className="h-[80px] rounded-[20px] px-8 text-xl"
                    onClick={() => void runAct("finish").then(() => setRecapOpen(true))}
                  >
                    {copy.crew.run.confirmYes}
                  </Button>
                </>
              ) : (
                <>
                  {run === "running" && (
                    <Button
                      variant="secondary"
                      className="h-[80px] gap-3 rounded-[20px] px-8 text-xl"
                      onClick={() => void runAct("pause")}
                    >
                      <Pause size={24} strokeWidth={2.5} /> {copy.crew.run.pause}
                    </Button>
                  )}
                  {run === "paused" && (
                    <Button
                      className="h-[80px] gap-3 rounded-[20px] px-8 text-xl [--lx:6px]"
                      onClick={() => void runAct("start")}
                    >
                      <Play size={24} strokeWidth={2.5} /> {copy.crew.run.resume}
                    </Button>
                  )}
                  {(run === "running" || run === "paused") && (
                    <Button
                      variant="plain"
                      className="h-[80px] gap-3 rounded-[20px] px-8 text-xl"
                      onClick={() => setFinishAsk(true)}
                    >
                      <Flag size={24} strokeWidth={2.5} /> {copy.crew.run.finish}
                    </Button>
                  )}
                  {/* Selalu ada: event tanpa timer (mis. sebelum 0.5.48) tetap punya rekap perkiraan sesi pertama → terakhir. */}
                  <Button
                    variant="secondary"
                    className="h-[80px] gap-3 rounded-[20px] px-8 text-xl"
                    onClick={() => setRecapOpen(true)}
                  >
                    <ClipboardList size={24} strokeWidth={2.5} /> {copy.crew.run.recap}
                  </Button>
                </>
              )}
            </div>
          </section>
        )}
        <div className="grid grid-cols-4 gap-6 portrait:grid-cols-2">
          <Tile
            icon={Camera}
            title={copy.crew.camera}
            under="mint"
            pill={cameraPill}
            onOpen={() => setSection("camera")}
          >
            <div className={big}>
              {status ? (status.cameraService ? copy.crew.ready : copy.crew.down) : "…"}
            </div>
            <div className={sub}>{copy.crew.cameraService}</div>
          </Tile>
          <Tile
            icon={Printer}
            title={copy.crew.printerTitle}
            under="sky"
            pill={printerPill}
            onOpen={() => setSection("printer")}
          >
            <div className={big}>±{status?.paper.remaining ?? "…"}</div>
            <div className={`${sub} truncate`}>
              {status ? copy.crew.paper(status.paper.remaining, status.paper.capacity) : "…"}
            </div>
            {paperLow && (
              <span className="mt-2 inline-block">
                <Pill tone="peach">{copy.crew.paperLow}</Pill>
              </span>
            )}
          </Tile>
          <Tile
            icon={ArrowUpDown}
            title={copy.crew.connection}
            under="peach"
            pill={onlinePill}
            onOpen={() => setSection("system")}
          >
            <div className={`${big} text-[30px] leading-tight`}>
              {status?.uploadPending ? copy.crew.unsent(status.uploadPending) : copy.crew.allSent}
            </div>
            <div className={`${sub} truncate`} data-testid="cloud-device">
              {revoked
                ? copy.crew.revoked
                : status?.device
                  ? copy.crew.paired(status.device.name, status.device.shortCode)
                  : copy.crew.unpaired}
            </div>
          </Tile>
          <Tile
            icon={TriangleAlert}
            title={copy.crew.failedPrints}
            under="lavender"
            pill={<Pill tone={failed.length ? "coral" : "white"}>{failed.length}</Pill>}
            onOpen={() => setSection("printer")}
          >
            <div className={big}>{failed.length}</div>
            <div className={sub}>{failed.length ? copy.crew.reprint : copy.crew.none}</div>
          </Tile>
        </div>
      </>
    ),
    camera: (
      <>
        <Group title={copy.crew.camera} pill={cameraPill}>
          <Button className={action} onClick={onCameraCheck}>
            {copy.crew.openCameraCheck}
          </Button>
          <Button variant="plain" className={action} onClick={() => setSheet("device")}>
            {copy.crew.device}
          </Button>
        </Group>
        {p.crew.focus && (
          <Group title={copy.crew.cameraSettingsTitle} column>
            <CameraProps onNote={setNote} />
          </Group>
        )}
      </>
    ),
    printer: (
      <>
        <Group title={copy.crew.printerTitle} pill={printerPill}>
          <p className="col-span-full flex flex-wrap items-center gap-3 text-2xl font-bold">
            {status ? copy.crew.paper(status.paper.remaining, status.paper.capacity) : "…"}
            {paperLow && <Pill tone="peach">{copy.crew.paperLow}</Pill>}
            {status?.printer.message && ` · ${status.printer.message}`}
          </p>
          <Button variant="plain" className={action} onClick={doTestPrint}>
            {copy.crew.testPrint}
          </Button>
          <Button variant="plain" className={action} onClick={openRoll}>
            {copy.crew.newRoll}
          </Button>
          <Button
            variant="plain"
            className={action}
            onClick={() =>
              p.crew.printerSettings().then(
                () => setNote(copy.crew.printerSettingsDone),
                (e: unknown) => setNote(crewText(e)),
              )
            }
          >
            {copy.crew.printerSettings}
          </Button>
          <Button variant="plain" className={action} onClick={() => setSheet("device")}>
            {copy.crew.printerSource}
          </Button>
          <PrintToneCard />
        </Group>
        <Group title={`${copy.crew.failedPrints} · ${failed.length}`} column>
          {failedList}
        </Group>
      </>
    ),
    event: (
      <>
        <Group title={copy.crew.activeEvent}>
          <p className="col-span-full text-3xl font-extrabold">
            {event.name} <span className="text-text-2">· {modeLabel}</span>
          </p>
          <Button variant="plain" className={action} onClick={onChangeEvent}>
            {copy.crew.changeEvent}
          </Button>
          <Button
            variant="plain"
            className={action}
            disabled={!hasEvent}
            onClick={() => setSheet("settings")}
          >
            {copy.crew.eventSettings}
          </Button>
        </Group>
        <Group title={copy.crew.designTitle} column>
          {hasEvent &&
            eventDesigns(event).map((d) => {
              const at = localDesigns[d.id];
              return (
                <div
                  key={d.id}
                  data-testid="design-row"
                  className="flex items-center gap-5 rounded-[20px] border-2 border-ink px-6 py-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-2xl font-bold">{d.name}</span>
                    <span
                      className={`w-fit rounded-full border-2 border-ink px-3 text-lg font-semibold ${at ? "bg-peach" : "bg-paper text-text-2"}`}
                    >
                      {d.info ? `${d.info} · ` : ""}
                      {at ? copy.crew.designLocal(hhmm(at)) : copy.crew.designCloud}
                    </span>
                  </div>
                  {at && (
                    <Button
                      variant="plain"
                      className="h-[76px] rounded-[18px] px-6 text-xl"
                      onClick={() =>
                        p.crew
                          .resetDesign(event.id, d.id)
                          .then(async () => {
                            setNote(copy.crew.designReset(d.name));
                            await onReloadEvents();
                          })
                          .catch((e: unknown) => setNote(crewText(e)))
                      }
                    >
                      {copy.crew.resetToCloud}
                    </Button>
                  )}
                  <Button
                    className="h-[76px] rounded-[18px] px-8 text-xl"
                    onClick={() => onEditDesign(d.id)}
                  >
                    {copy.crew.editDesign}
                  </Button>
                </div>
              );
            })}
          <p className="text-xl font-medium text-text-2">{copy.crew.designNote}</p>
          <Button
            variant="plain"
            className={`${action} w-fit px-10`}
            disabled={!hasEvent}
            onClick={() =>
              p.crew
                .openAdmin(`/admin/events/${event.id}/settings`)
                .catch((e: unknown) => setNote(crewText(e)))
            }
          >
            {copy.crew.designAdmin}
          </Button>
        </Group>
      </>
    ),
    system: (
      <>
        <Group title={copy.crew.cloudTitle} pill={onlinePill}>
          <p className="col-span-full text-2xl font-bold">
            {revoked
              ? copy.crew.revoked
              : status?.device
                ? copy.crew.paired(status.device.name, status.device.shortCode)
                : copy.crew.unpaired}
            {!revoked && (
              <span className="text-text-2">
                {" "}
                ·{" "}
                {status?.uploadError ??
                  (status?.uploadPending
                    ? copy.crew.unsent(status.uploadPending)
                    : copy.crew.allSent)}
              </span>
            )}
          </p>
          <Button variant="plain" className={action} onClick={onPair}>
            {revoked ? copy.crew.pairNew : status?.device ? copy.crew.pairAgain : copy.crew.pair}
          </Button>
          {!!status?.uploadPending && status.device && (
            <Button variant="plain" className={action} onClick={act(() => p.crew.retryUploads())}>
              {copy.crew.retryUpload}
            </Button>
          )}
        </Group>
        <Group title={copy.crew.systemTitle} column>
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
        </Group>
        <Group title={copy.crew.sharpen.title} column>
          <p className="text-lg font-semibold text-text-2">{copy.crew.sharpen.body}</p>
          {sharpen && (
            <p data-testid="sharpen-status" className="text-2xl font-bold">
              {sharpen.running
                ? copy.crew.sharpen.progress(
                    sharpen.done,
                    sharpen.total,
                    sharpen.mismatch + sharpen.skipped,
                  )
                : copy.crew.sharpen.summary(sharpen)}
            </p>
          )}
          {sharpen?.running ? (
            <Button
              variant="plain"
              className={`${action} self-start px-10`}
              onClick={() => stopSharpen.current?.abort()}
            >
              {copy.crew.cancel}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className={`${action} self-start px-10`}
              disabled={!status?.device}
              onClick={startSharpen}
            >
              {copy.crew.sharpen.start}
            </Button>
          )}
        </Group>
        <Group title={copy.crew.appTitle}>
          <Button variant="plain" className={action} onClick={openUpdate}>
            {copy.crew.update}
          </Button>
          <Button variant="plain" className={action} onClick={onChangePin}>
            {copy.crew.changePin}
          </Button>
          <Button variant="destructive" className={action} onClick={() => setSheet("exit")}>
            {copy.crew.exit}
          </Button>
        </Group>
      </>
    ),
  };

  return (
    <main className="flex h-full w-full bg-paper portrait:flex-col">
      <nav className="flex w-[340px] shrink-0 flex-col gap-3 border-r-[2.5px] border-ink bg-white px-6 py-10 portrait:w-full portrait:flex-row portrait:flex-wrap portrait:border-r-0 portrait:border-b-[2.5px] portrait:py-4">
        <div className="mb-6 flex items-center gap-4 portrait:mb-0">
          <Logo />
          <h1 className="rounded-full border-2 border-ink bg-lavender px-3.5 py-1.5 text-lg font-bold whitespace-nowrap">
            {copy.crew.title}
          </h1>
        </div>
        {SECTIONS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? "page" : undefined}
            data-testid={`crew-nav-${id}`}
            onClick={() => setSection(id)}
            className={`pressable flex h-[72px] items-center gap-4 rounded-[18px] border-[2.5px] px-5 text-left text-2xl font-bold ${section === id ? "border-ink bg-mint-soft" : "border-transparent"}`}
          >
            <Icon size={26} strokeWidth={2.2} />
            {copy.crew.nav[id]}
            {id === "printer" && failed.length > 0 && (
              <span className="ml-auto rounded-full border-2 border-ink bg-coral px-2.5 text-base">
                {failed.length}
              </span>
            )}
          </button>
        ))}
        <Button
          className="mt-auto h-[92px] gap-2 rounded-[20px] px-4 text-xl [--lx:7px] [--under:#fff] portrait:mt-0"
          data-testid="to-guest"
          onClick={openForGuests}
        >
          {copy.crew.toGuest} <ArrowRight size={24} strokeWidth={2.5} />
        </Button>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-7 overflow-y-auto px-14 py-10 portrait:px-8">
        <header className="flex items-center justify-between gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-ink bg-peach">
              <Heart size={20} fill="currentColor" />
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-text-2">{copy.crew.activeEvent}</div>
              <div className="truncate text-[26px] font-extrabold">
                {event.name} — {modeLabel}
              </div>
            </div>
            {localSettings && (
              <span
                data-testid="settings-local"
                className="shrink-0 rounded-full border-2 border-ink bg-butter px-3 text-[15px] font-bold"
              >
                {copy.crew.changedHereBadge}
              </span>
            )}
          </div>
          {note && (
            <p
              className="max-w-[45%] truncate rounded-2xl border-2 border-dashed border-ink bg-sky px-5 py-3 text-xl font-semibold"
              role="status"
            >
              {note}
            </p>
          )}
        </header>

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
              onClick={() => setSection("camera")}
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

        <h2 className="text-[44px] leading-none font-extrabold tracking-[-0.03em]">
          {copy.crew.nav[section]}
        </h2>
        {content[section]}
      </div>

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

      {goAsk && (
        <StartDialog
          state={run === "paused" || run === "finished" ? run : "idle"}
          onStart={() => void runAct(run === "idle" ? "arm" : "start").then(() => onClose("live"))}
          onTest={() => onClose("test")}
          onClose={() => setGoAsk(false)}
        />
      )}
      {recapOpen && <BoothRecap event={event} onClose={() => setRecapOpen(false)} />}
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
