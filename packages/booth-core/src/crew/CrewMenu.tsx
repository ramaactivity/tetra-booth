import {
  clockOn,
  durationText,
  type EventRun,
  localYmd,
  paperLabel,
  printPaper,
  type RunAction,
  runElapsedMs,
} from "@tetra/shared";
import { Button } from "@tetra/ui";
import {
  ArrowRight,
  Camera,
  Check,
  ClipboardList,
  Flag,
  Focus,
  LayoutGrid,
  Link2,
  type LucideIcon,
  Palette,
  Pause,
  Play,
  Printer,
  QrCode as QrCodeIcon,
  Settings,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { boothSound, guestCursor } from "../cursorPref";
import { eventDesigns } from "../designEdit";
import { crewText, errText } from "../errors";
import { type BoothEvent, DEFAULT_EVENT } from "../event";
import { GalleryQr } from "../GalleryQr";
import { usePlatform } from "../PlatformContext";
import type { BoothRunState, CrewStatus, FailedPrint, UpdateCheck } from "../platform";
import { type SharpenProgress, sharpenOldSessions } from "../rerender";
import { sharpNotes } from "../sharpness";
import { Logo } from "../ui";
import { BoothRecap } from "./BoothRecap";
import { CameraProps } from "./CameraProps";
import { CameraChoice, CameraView, PrinterChoice, RoleChoice, SaveBar, useDevice } from "./devices";
import { EventSettings } from "./EventSettings";
import { PrintToneCard } from "./PrintTone";
import { btn, dot, Panel, Pill, Row, StatusStrip, ToggleRow, type Tone } from "./parts";
import { Sheet } from "./Sheet";
import { StartDialog } from "./StartDialog";
import { testPrint } from "./testPrint";

const PAPER_LOW = 30;
const DEFAULT_ROLL = 700;
const c = copy.crew;

type Section = "home" | "camera" | "printer" | "event" | "system";
const SECTIONS: { id: Section; icon: LucideIcon }[] = [
  { id: "home", icon: LayoutGrid },
  { id: "camera", icon: Camera },
  { id: "printer", icon: Printer },
  { id: "event", icon: Palette },
  { id: "system", icon: Settings },
];

/** Satu langkah "Siapkan booth": nomor/centang, judul, keadaan, satu tombol di kanan. */
function Step({
  n,
  done,
  title,
  detail,
  action,
  onAction,
  alt,
  attention = false,
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
  /** Aksi kedua yang lebih ringan (mis. Lewati). */
  alt?: { label: string; onClick: () => void } | undefined;
  /** Perlu perhatian (mis. versi baru tersedia): isian peach, bukan peringatan merah. */
  attention?: boolean;
  testId: string;
}) {
  return (
    <li
      data-testid={testId}
      data-done={done}
      className={`flex min-h-[96px] items-center gap-5 rounded-[20px] border-[2.5px] border-ink px-5 py-4 ${done ? "bg-mint-soft" : attention ? "bg-peach" : "bg-white"}`}
    >
      <span
        className={`flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-ink text-xl font-extrabold ${done ? "bg-green text-white" : "bg-butter"}`}
      >
        {done ? <Check size={24} strokeWidth={3} /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="text-[22px] leading-tight font-bold">
          {title}
          {optional && !done && (
            <span className="ml-2 align-middle text-base font-semibold text-text-2">
              ({c.setup.optional})
            </span>
          )}
        </h3>
        <p className="text-lg font-medium text-text-2">
          {done && <strong className="text-ink">{c.setup.ready} · </strong>}
          {detail}
        </p>
      </div>
      {alt && (
        <Button
          variant="plain"
          className="h-16 shrink-0 rounded-[18px] px-5 text-xl"
          onClick={alt.onClick}
        >
          {alt.label}
        </Button>
      )}
      {action && (
        <Button
          variant={done ? "plain" : "secondary"}
          className="h-16 w-[200px] shrink-0 rounded-[18px] px-4 text-xl"
          onClick={onAction}
        >
          {action}
        </Button>
      )}
    </li>
  );
}

/** Penanda tahap alur kerja crew: Siapkan → Acara berjalan → Selesai & rekap. */
function Journey({ now }: { now: 0 | 1 | 2 }) {
  return (
    <ol className="grid grid-cols-3 gap-3" aria-label={c.flow.title}>
      {c.flow.steps.map((s, i) => {
        const state = i < now ? "done" : i === now ? "now" : "next";
        return (
          <li
            key={s}
            aria-current={state === "now" ? "step" : undefined}
            className={`flex items-center gap-3 rounded-full border-[2.5px] px-5 py-2.5 ${state === "now" ? "border-ink bg-butter" : state === "done" ? "border-ink bg-mint-soft" : "border-line-soft bg-white text-text-2"}`}
          >
            <span
              className={`flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-base font-extrabold ${state === "next" ? "border-line-soft" : "border-ink bg-white"}`}
            >
              {state === "done" ? <Check size={18} strokeWidth={3} /> : i + 1}
            </span>
            <span className="truncate text-xl font-bold">{s}</span>
            <span className="ml-auto text-base font-semibold whitespace-nowrap">
              {c.flow.state[state]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Baris ringkas "Selama acara": keadaan + satu aksi kecil yang membawa ke bagiannya. */
function Glance({
  label,
  value,
  pill,
  action,
  onAction,
  valueTestId,
}: {
  label: string;
  value: ReactNode;
  pill?: ReactNode;
  action: string;
  onAction: () => void;
  valueTestId?: string;
}) {
  return (
    <Row
      label={
        <span className="flex items-center gap-3">
          {label} {pill}
        </span>
      }
      hint={<span data-testid={valueTestId}>{value}</span>}
    >
      <Button variant="plain" className="h-14 rounded-[16px] px-5 text-lg" onClick={onAction}>
        {action}
      </Button>
    </Row>
  );
}

/**
 * Mode crew (perombakan UI, Okt 2026): menu samping berstatus (Ringkasan · Kamera · Printer · Event & Desain · Sistem).
 * Ringkasan = alur kerja crew dari awal sampai rekap; tiap perangkat punya satu halaman berisi pilih, cek, dan setelannya.
 * Perubahan perangkat (kamera, printer, cermin, peran laptop) disimpan sekaligus lewat bar di bawah.
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
  const [clearAsk, setClearAsk] = useState(false);
  const [roll, setRoll] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"roll" | "exit" | "update" | null>(startExit ? "exit" : null);
  const [localSettings, setLocalSettings] = useState(false);
  const hasEvent = event.id !== DEFAULT_EVENT.id;
  const loadLocalSettings = useCallback(() => {
    if (!hasEvent) return;
    p.crew.eventSettings(event.id).then(
      (i) => setLocalSettings(Object.keys(i.override).length > 0),
      () => {},
    );
  }, [p, event, hasEvent]);
  useEffect(loadLocalSettings, [loadLocalSettings]);
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
  const [galleryQr, setGalleryQr] = useState<string | null>(null);
  useEffect(() => {
    if (!hasEvent) return;
    p.crew.runState(event.id).then(setRun, () => {});
  }, [p, event, hasEvent]);
  // Jam mulai & lama berjalan (masukan Rama): segmen timer dari rekap, diperbarui tiap 30 dtk.
  const [segs, setSegs] = useState<EventRun | null>(null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!hasEvent || !run || run === "idle" || run === "waiting") return setSegs(null);
    p.crew.recap(event.id).then(
      (r) => setSegs(r.run?.segments.length ? r.run : null),
      () => {},
    );
    if (run !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [p, event, hasEvent, run]);
  const startAt = segs?.segments[0]?.start;
  const [note, setNoteRaw] = useState<string>();
  // Catatan tampil sebagai toast di pojok, hilang sendiri setelah 8 detik (tidak lagi terpotong di header).
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setNote = useCallback((m: string) => {
    setNoteRaw(m);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNoteRaw(undefined), 8000);
  }, []);
  useEffect(() => () => clearTimeout(noteTimer.current), []);
  const dev = useDevice(setNote);
  const runAct = (a: RunAction | "arm") =>
    p.crew.eventRun(event.id, a).then(
      (s) => {
        setFinishAsk(false);
        setRun(s);
        if (!status?.online && a !== "arm") setNote(c.run.offline);
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
  const [soundOn, setSoundOn] = useState(boothSound.on);
  /** Job test print / cetak ulang terakhir: hasil akhirnya menggantikan catatan "dikirim" (W-018). */
  const [, setWatching] = useState<string | null>(null);
  const [auto, setAuto] = useState<{ enabled: boolean; supported: boolean }>();
  useEffect(() => {
    p.crew.autoStart().then(setAuto, (e: unknown) => setNote(errText(e)));
  }, [p, setNote]);

  const refresh = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([p.crew.status(), p.crew.failedPrints()]);
      setStatus({ ...s, online: s.online && navigator.onLine });
      setFailed(f);
    } catch (e) {
      setNote(errText(e));
    }
  }, [p, setNote]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    const off = p.crew.onPrintUpdated((u) => {
      void refresh();
      setWatching((w) => {
        if (w === u.jobId) setNote(u.ok ? c.printed : c.printFailed(u.message ?? ""));
        return w === u.jobId ? null : w;
      });
    });
    return () => {
      clearInterval(t);
      off();
    };
  }, [p, refresh, setNote]);

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
      setDl({ received, total, eta });
    });
  }, [p]);

  // Unduh + pasang dari sheet update: sheet tetap terbuka dengan progress bar; gagal = kotak merah + Coba Lagi.
  const installUpdate = () => {
    setUpdErr(null);
    setDl({ received: 0, total: 0, eta: "" });
    p.crew.installUpdate().catch((e: unknown) => {
      setDl(null);
      setUpdErr(crewText(e));
    });
  };

  const act = (fn: () => Promise<unknown>, done?: string) => () =>
    fn()
      .then(() => {
        if (done) setNote(done);
        return refresh();
      })
      .catch((e: unknown) => setNote(crewText(e)));

  const [section, setSection] = useState<Section>("home");
  const modeLabel = event.photobox ? copy.start.mode.photobox : copy.start.mode.event;
  const paperLow = !!status && status.paper.remaining <= PAPER_LOW;
  const openRoll = () => {
    setRoll(String(status?.paper.capacity ?? DEFAULT_ROLL));
    setSheet("roll");
  };
  // Versi aplikasi = langkah pertama checklist (#222): dicek sekali saat mode crew dibuka, tidak memblokir.
  const [ver, setVer] = useState<UpdateCheck | null>(null);
  const [verSkip, setVerSkip] = useState(false);
  const checkVersion = useCallback(() => {
    setVer(null);
    p.crew.checkUpdate().then(setVer, () => {});
  }, [p]);
  useEffect(checkVersion, [checkVersion]);
  const openUpdate = () => {
    setSheet("update");
    if (ver?.available) return setUpdate(ver);
    setUpdate(null);
    p.crew.checkUpdate().then(
      (u) => {
        setUpdate(u);
        setVer(u);
      },
      (e: unknown) => {
        setSheet(null);
        setNote(crewText(e));
      },
    );
  };
  const newVersion = !!ver?.available && !!ver.latest;
  const doTestPrint = act(async () => setWatching(await testPrint(p, event)), c.sent);
  const printerSettings = () =>
    p.crew.printerSettings().then(
      () => setNote(c.printerSettingsDone),
      (e: unknown) => setNote(crewText(e)),
    );

  const cameraOk = !!(status?.camera ?? status?.cameraService);
  const printerReady = status?.printer.status === "ready";
  const printerTone: Tone = printerReady
    ? "mint"
    : status?.printer.status === "unknown"
      ? "white"
      : "coral";
  const cameraPill = status && (
    <Pill tone={cameraOk ? "mint" : "coral"}>
      {dot}
      {cameraOk ? c.connected : c.down}
    </Pill>
  );
  const printerPill = status && (
    <Pill tone={printerTone}>
      {dot}
      {c.printerState(status.printer.status)}
    </Pill>
  );
  const revoked = !!status?.device?.revoked;
  const onlinePill = status && (
    <Pill tone={revoked ? "coral" : status.online ? "mint" : "peach"}>
      {dot}
      {revoked ? c.revokedPill : status.online ? c.online : c.offline}
    </Pill>
  );
  const deviceText = revoked
    ? c.revoked
    : status?.device
      ? c.paired(status.device.name, status.device.shortCode)
      : c.unpaired;
  const uploadText =
    status?.uploadError ?? (status?.uploadPending ? c.unsent(status.uploadPending) : c.allSent);
  const savedCamera = dev.info?.now.camera ?? "webcam";
  const cameraName = c.dev.choice[savedCamera].title;
  const runTone: Tone =
    run === "running"
      ? "mint"
      : run === "paused"
        ? "peach"
        : run === "finished"
          ? "sky"
          : run === "waiting"
            ? "lavender"
            : "white";
  /** Tahap alur kerja: sebelum acara, selama acara, sesudah acara dihentikan. */
  const phase: 0 | 1 | 2 =
    run === "running" || run === "paused" || run === "waiting" ? 1 : run === "finished" ? 2 : 0;

  /** Status singkat di bawah nama tiap bagian menu samping. */
  const navStatus: Record<Section, ReactNode> = {
    home: run ? c.run.state[run] : c.flow.steps[0],
    camera: status ? `${cameraName} · ${cameraOk ? c.connected : c.down}` : "…",
    printer: status
      ? printerReady
        ? c.paperShort(status.paper.remaining)
        : c.printerState(status.printer.status)
      : "…",
    event: hasEvent ? event.name : c.setup.eventTodo,
    system: newVersion
      ? c.setup.versionNav
      : status
        ? revoked
          ? c.revokedPill
          : status.online
            ? c.online
            : c.offline
        : "…",
  };
  const navAlert: Record<Section, boolean> = {
    home: false,
    camera: !!status && !cameraOk,
    printer: failed.length > 0 || paperLow || (!!status && !printerReady),
    event: !hasEvent,
    system: revoked || newVersion,
  };

  const failedList =
    failed.length === 0 ? (
      <p className="text-xl font-semibold text-text-2">{c.none}</p>
    ) : (
      <ul className="flex flex-col gap-4">
        {failed.map((f) => (
          <li key={f.id}>
            <Row
              label={
                <span className="font-mono">
                  {new Date(f.createdAt).toLocaleTimeString("id-ID")} · {f.copies}×
                </span>
              }
              hint={
                <>
                  {f.error}
                  {f.error?.startsWith("print_uncertain") && (
                    <strong className="mt-1 block font-bold text-ink">{c.uncertain}</strong>
                  )}
                </>
              }
            >
              <Button
                variant="secondary"
                className="h-14 rounded-2xl px-5 text-xl"
                onClick={act(async () => setWatching(await p.crew.reprint(f.id)), c.sent)}
              >
                {c.reprint}
              </Button>
            </Row>
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-3 border-t-2 border-dashed border-line-soft pt-4">
          {clearAsk ? (
            <>
              <span className="text-lg font-semibold">{c.clearFailedAsk(failed.length)}</span>
              <Button
                className="h-14 rounded-2xl px-5 text-xl"
                onClick={act(async () => {
                  setClearAsk(false);
                  await p.crew.clearFailedPrints();
                }, c.clearFailedDone)}
              >
                {c.clearFailedYes}
              </Button>
              <Button
                variant="plain"
                className="h-14 rounded-2xl px-5 text-xl"
                onClick={() => setClearAsk(false)}
              >
                {c.cancel}
              </Button>
            </>
          ) : (
            <Button
              variant="secondary"
              data-testid="clear-failed"
              className="h-14 rounded-2xl px-5 text-xl"
              onClick={() => setClearAsk(true)}
            >
              {c.clearFailed}
            </Button>
          )}
        </li>
      </ul>
    );

  const runButtons = run && (
    <div className="flex flex-wrap gap-4">
      {finishAsk ? (
        <>
          <Button variant="plain" className={btn} onClick={() => setFinishAsk(false)}>
            {c.run.cancel}
          </Button>
          <Button
            variant="destructive"
            className={btn}
            onClick={() => void runAct("finish").then(() => setRecapOpen(true))}
          >
            {c.run.confirmYes}
          </Button>
        </>
      ) : (
        <>
          {run === "running" && (
            <Button variant="secondary" className={btn} onClick={() => void runAct("pause")}>
              <Pause size={24} strokeWidth={2.5} /> {c.run.pause}
            </Button>
          )}
          {run === "paused" && (
            <Button className={`${btn} [--lx:6px]`} onClick={() => void runAct("start")}>
              <Play size={24} strokeWidth={2.5} /> {c.run.resume}
            </Button>
          )}
          {(run === "running" || run === "paused") && (
            <Button variant="plain" className={btn} onClick={() => setFinishAsk(true)}>
              <Flag size={24} strokeWidth={2.5} /> {c.run.finish}
            </Button>
          )}
        </>
      )}
    </div>
  );

  const during = (
    <Panel
      title={`2 · ${c.flow.steps[1]}`}
      hint={run ? (finishAsk ? c.run.confirm : c.run[run]) : c.flow.localEvent}
      aside={
        run && (
          <Pill tone={runTone}>
            {dot}
            {c.run.state[run]}
          </Pill>
        )
      }
    >
      {startAt && (
        <p data-testid="crew-run-time" className="text-xl font-bold">
          {c.run.since(
            clockOn(startAt, localYmd(now)),
            durationText(runElapsedMs(segs, now) / 60_000),
          )}
        </p>
      )}
      {runButtons}
      <div className="flex flex-col gap-4">
        <Glance
          label={c.camera}
          pill={cameraPill}
          value={cameraName}
          action={c.flow.open}
          onAction={() => setSection("camera")}
        />
        <Glance
          label={c.flow.paper}
          pill={paperLow && <Pill tone="peach">{c.paperLow}</Pill>}
          value={status ? c.paper(status.paper.remaining, status.paper.capacity) : "…"}
          action={c.newRoll}
          onAction={openRoll}
        />
        <Glance
          label={c.failedPrints}
          pill={<Pill tone={failed.length ? "coral" : "white"}>{failed.length}</Pill>}
          value={failed.length ? c.flow.failedTodo : c.none}
          action={c.flow.open}
          onAction={() => setSection("printer")}
        />
        <Glance
          label={c.flow.upload}
          pill={onlinePill}
          value={deviceText}
          valueTestId="cloud-device"
          action={c.flow.open}
          onAction={() => setSection("system")}
        />
      </div>
    </Panel>
  );

  const after = (
    <Panel title={`3 · ${c.flow.steps[2]}`} hint={c.flow.afterHint}>
      <div className="flex flex-wrap gap-4">
        <Button
          variant={phase === 2 ? "primary" : "secondary"}
          className={`${btn} [--lx:6px]`}
          disabled={!hasEvent}
          onClick={() => setRecapOpen(true)}
        >
          <ClipboardList size={24} strokeWidth={2.5} /> {c.run.recap}
        </Button>
        {/* Galeri online (#240): salin link atau tampilkan QR untuk tamu/klien. Butuh internet. */}
        <Button
          variant="secondary"
          className={btn}
          disabled={!hasEvent || event.id === "local"}
          onClick={act(() => p.crew.galleryLink(event.id), copy.galleryQr.copied)}
        >
          <Link2 size={24} strokeWidth={2.5} /> {copy.crew.recap.link}
        </Button>
        <Button
          variant="secondary"
          className={btn}
          disabled={!hasEvent || event.id === "local"}
          onClick={act(() => p.crew.galleryLink(event.id).then(setGalleryQr))}
        >
          <QrCodeIcon size={24} strokeWidth={2.5} /> {copy.galleryQr.button}
        </Button>
      </div>
    </Panel>
  );

  const content: Record<Section, ReactNode> = {
    home: (
      <>
        <Journey now={phase} />
        <div className="grid grid-cols-[1.05fr_1fr] items-start gap-6 portrait:grid-cols-1">
          <Panel title={`1 · ${c.setup.title}`} hint={c.setup.sub}>
            <ol className="flex flex-col gap-4">
              <Step
                n={1}
                optional
                testId="step-version"
                done={!!ver && !ver.offline && !ver.available}
                attention={newVersion && !verSkip}
                title={c.setup.version}
                detail={
                  !ver
                    ? c.setup.versionChecking
                    : ver.offline
                      ? c.setup.versionOffline(ver.current)
                      : newVersion && ver.latest
                        ? (verSkip ? c.setup.versionSkipped : c.setup.versionNew)(
                            ver.latest,
                            ver.current,
                          )
                        : c.setup.versionLatest(ver.current)
                }
                action={
                  ver?.offline
                    ? c.setup.versionRetry
                    : newVersion
                      ? c.setup.versionUpdate
                      : undefined
                }
                onAction={ver?.offline ? checkVersion : openUpdate}
                alt={
                  newVersion && !verSkip
                    ? { label: c.setup.versionSkip, onClick: () => setVerSkip(true) }
                    : undefined
                }
              />
              <Step
                n={2}
                optional
                testId="step-pair"
                done={!!status?.device}
                title={c.setup.pair}
                detail={status?.device ? deviceText : c.setup.pairTodo}
                action={status?.device ? undefined : c.setup.pairAction}
                onAction={onPair}
              />
              <Step
                n={3}
                testId="step-event"
                done={hasEvent}
                title={c.setup.event}
                detail={
                  hasEvent
                    ? `${event.name} · ${paperLabel(event.layout.paper, event.layout.canvas)}`
                    : c.setup.eventTodo
                }
                action={hasEvent ? c.setup.eventChange : c.setup.eventAction}
                onAction={onChangeEvent}
              />
              <Step
                n={4}
                testId="step-camera"
                done={cameraOk}
                title={c.setup.camera}
                detail={cameraOk ? `${cameraName} · ${c.setup.cameraOk}` : c.setup.cameraTodo}
                action={cameraOk ? c.setup.cameraAction : c.setup.pickCamera}
                onAction={cameraOk ? onCameraCheck : () => setSection("camera")}
              />
              <Step
                n={5}
                optional
                testId="step-printer"
                done={printerReady}
                title={c.setup.printer}
                detail={printerReady ? c.setup.printerOk : c.setup.printerTodo}
                action={printerReady ? c.setup.printerAction : c.setup.pickPrinter}
                onAction={printerReady ? doTestPrint : () => setSection("printer")}
              />
            </ol>
            <div className="flex items-center gap-6 rounded-[20px] border-[2.5px] border-dashed border-ink bg-paper px-6 py-5">
              <p className="min-w-0 flex-1 text-lg font-semibold text-text-2">{c.setup.openHint}</p>
              <Button
                className="h-[88px] shrink-0 rounded-[22px] px-10 text-[26px] [--lx:7px] [--under:#fff]"
                data-testid="open-guests"
                onClick={openForGuests}
              >
                {c.setup.open} <ArrowRight size={28} strokeWidth={2.5} />
              </Button>
            </div>
          </Panel>
          <div
            className="flex min-w-0 flex-col gap-6"
            data-testid={run ? "crew-run" : undefined}
            data-state={run ?? undefined}
          >
            {during}
            {after}
          </div>
        </div>
      </>
    ),
    camera: (
      <>
        <StatusStrip
          icon={Camera}
          tone={cameraOk ? "mint" : "coral"}
          title={cameraName}
          pill={cameraPill}
          detail={cameraOk ? c.setup.cameraOk : c.cameraHelp}
        >
          <Button className={`${btn} h-[88px] px-10 text-2xl [--lx:6px]`} onClick={onCameraCheck}>
            {c.openCameraCheck}
          </Button>
        </StatusStrip>
        <div className="grid grid-cols-[1.1fr_1fr] items-start gap-6 portrait:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-6">
            <CameraChoice dev={dev} />
            <CameraView dev={dev} />
          </div>
          {p.crew.focus ? (
            <Panel title={c.cameraSettingsTitle} hint={c.cameraSettingsHint}>
              <CameraProps onNote={setNote} grouped showEmpty />
            </Panel>
          ) : (
            <Panel title={c.cameraSettingsTitle}>
              <p className="text-lg font-medium text-text-2">{c.cameraSettingsNone}</p>
            </Panel>
          )}
        </div>
      </>
    ),
    printer: (
      <>
        <StatusStrip
          icon={Printer}
          tone={printerTone}
          title={dev.info?.now.printer ?? c.flow.noPrinterPicked}
          pill={printerPill}
          detail={
            status
              ? `${c.paper(status.paper.remaining, status.paper.capacity)}${status.printer.message ? ` · ${status.printer.message}` : ""}`
              : "…"
          }
        >
          <Button className={`${btn} h-[88px] px-10 text-2xl [--lx:6px]`} onClick={doTestPrint}>
            {c.testPrint}
          </Button>
        </StatusStrip>
        <div className="grid grid-cols-2 items-start gap-6 portrait:grid-cols-1">
          <div className="flex min-w-0 flex-col gap-6">
            <Panel
              title={c.flow.paper}
              hint={c.flow.paperHint}
              aside={paperLow && <Pill tone="peach">{c.paperLow}</Pill>}
            >
              <Row
                label={
                  <span className="text-[34px] leading-none font-extrabold">
                    ±{status?.paper.remaining ?? "…"}
                  </span>
                }
                hint={status ? c.paper(status.paper.remaining, status.paper.capacity) : "…"}
              >
                <Button variant="secondary" className={btn} onClick={openRoll}>
                  {c.newRoll}
                </Button>
              </Row>
            </Panel>
            <PrinterChoice
              dev={dev}
              paper={printPaper(event.layout.paper)}
              onSettings={() => void printerSettings()}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-6">
            <Panel
              title={c.failedPrints}
              aside={<Pill tone={failed.length ? "coral" : "white"}>{failed.length}</Pill>}
            >
              {failedList}
            </Panel>
            <PrintToneCard />
          </div>
        </div>
      </>
    ),
    event: (
      <>
        <StatusStrip
          icon={Palette}
          tone="peach"
          title={hasEvent ? event.name : c.setup.eventTodo}
          pill={<Pill tone="white">{modeLabel}</Pill>}
          detail={
            hasEvent
              ? `${paperLabel(event.layout.paper, event.layout.canvas)}${localSettings ? ` · ${c.changedHereBadge}` : ""}`
              : c.flow.eventHint
          }
        >
          {localSettings && (
            <span
              data-testid="settings-local"
              className="rounded-full border-2 border-ink bg-butter px-3 py-1 text-base font-bold"
            >
              {c.changedHereBadge}
            </span>
          )}
          <Button className={`${btn} h-[88px] px-10 text-2xl [--lx:6px]`} onClick={onChangeEvent}>
            {hasEvent ? c.changeEvent : c.setup.eventAction}
          </Button>
        </StatusStrip>
        <div className="grid grid-cols-2 items-start gap-6 portrait:grid-cols-1">
          {hasEvent ? (
            <EventSettings
              event={event}
              onNote={setNote}
              onSaved={async () => {
                await onReloadEvents();
                loadLocalSettings();
              }}
            />
          ) : (
            <Panel title={c.eventSettings}>
              <p className="text-lg font-medium text-text-2">{c.flow.eventHint}</p>
            </Panel>
          )}
          <Panel title={c.designTitle} hint={c.designNote}>
            <div className="flex flex-col gap-4">
              {hasEvent &&
                eventDesigns(event).map((d) => {
                  const at = localDesigns[d.id];
                  return (
                    <div key={d.id} data-testid="design-row">
                      <Row
                        label={d.name}
                        hint={
                          <span
                            className={`inline-block rounded-full border-2 border-ink px-3 text-base font-semibold ${at ? "bg-peach text-ink" : "bg-paper"}`}
                          >
                            {d.info ? `${d.info} · ` : ""}
                            {at ? c.designLocal(hhmm(at)) : c.designCloud}
                          </span>
                        }
                      >
                        {at && (
                          <Button
                            variant="plain"
                            className="h-16 rounded-[18px] px-5 text-lg"
                            onClick={() =>
                              p.crew
                                .resetDesign(event.id, d.id)
                                .then(async () => {
                                  setNote(c.designReset(d.name));
                                  await onReloadEvents();
                                })
                                .catch((e: unknown) => setNote(crewText(e)))
                            }
                          >
                            {c.resetToCloud}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          className="h-16 rounded-[18px] px-6 text-lg"
                          onClick={() => onEditDesign(d.id)}
                        >
                          {c.editDesign}
                        </Button>
                      </Row>
                    </div>
                  );
                })}
            </div>
            <Button
              variant="plain"
              className={`${btn} self-start`}
              disabled={!hasEvent}
              onClick={() =>
                p.crew
                  .openAdmin(`/admin/events/${event.id}/settings`)
                  .catch((e: unknown) => setNote(crewText(e)))
              }
            >
              {c.designAdmin}
            </Button>
          </Panel>
        </div>
      </>
    ),
    system: (
      <div className="grid grid-cols-2 items-start gap-6 portrait:grid-cols-1">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={c.cloudTitle} aside={onlinePill}>
            <Row label={c.flow.account} hint={deviceText}>
              <Button variant="secondary" className={btn} onClick={onPair}>
                {revoked ? c.pairNew : status?.device ? c.pairAgain : c.pair}
              </Button>
            </Row>
            <Row label={c.flow.upload} hint={uploadText}>
              {!!status?.uploadPending && status.device && (
                <Button variant="plain" className={btn} onClick={act(() => p.crew.retryUploads())}>
                  {c.retryUpload}
                </Button>
              )}
            </Row>
          </Panel>
          <RoleChoice dev={dev} />
          <Panel title={c.sharpen.title} hint={c.sharpen.body}>
            {sharpen && (
              <p data-testid="sharpen-status" className="text-2xl font-bold">
                {sharpen.running
                  ? c.sharpen.progress(
                      sharpen.done,
                      sharpen.total,
                      sharpen.mismatch + sharpen.skipped,
                    )
                  : c.sharpen.summary(sharpen)}
              </p>
            )}
            {sharpen?.running ? (
              <Button
                variant="plain"
                className={`${btn} self-start`}
                onClick={() => stopSharpen.current?.abort()}
              >
                {c.cancel}
              </Button>
            ) : (
              <Button
                variant="secondary"
                className={`${btn} self-start`}
                disabled={!status?.device}
                onClick={startSharpen}
              >
                {c.sharpen.start}
              </Button>
            )}
          </Panel>
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title={c.systemTitle}>
            <div className="flex flex-col gap-4">
              <ToggleRow
                testId="booth-sound"
                label={c.sound}
                hint={c.soundHint}
                on={soundOn}
                onLabel={c.on}
                offLabel={c.off}
                onClick={() => {
                  boothSound.set(!soundOn);
                  setSoundOn(!soundOn);
                }}
              />
              <ToggleRow
                testId="guest-cursor"
                label={c.cursor}
                hint={c.flow.cursorHint}
                on={cursorOn}
                onLabel={c.cursorOn}
                offLabel={c.cursorOff}
                onClick={() => {
                  guestCursor.set(!cursorOn);
                  setCursorOn(!cursorOn);
                }}
              />
              {auto?.supported ? (
                <ToggleRow
                  label={c.autoStart}
                  hint={c.flow.autoStartHint}
                  on={auto.enabled}
                  onLabel={c.on}
                  offLabel={c.off}
                  onClick={act(async () => setAuto(await p.crew.setAutoStart(!auto.enabled)))}
                />
              ) : (
                <Row label={c.autoStart} hint={auto ? c.autoStartDev : "…"} />
              )}
            </div>
          </Panel>
          <Panel title={c.appTitle}>
            <Row label={c.update} hint={c.flow.updateHint}>
              <Button variant="secondary" className={btn} onClick={openUpdate}>
                {c.flow.checkUpdate}
              </Button>
            </Row>
            <Row label={c.flow.pin} hint={c.flow.pinHint}>
              <Button variant="plain" className={btn} onClick={onChangePin}>
                {c.changePin}
              </Button>
            </Row>
            <Row label={c.exit} hint={c.flow.exitHint}>
              <Button variant="destructive" className={btn} onClick={() => setSheet("exit")}>
                {c.exit}
              </Button>
            </Row>
          </Panel>
        </div>
      </div>
    ),
  };

  return (
    <main className="flex h-full w-full bg-paper portrait:flex-col">
      <nav className="flex w-[320px] shrink-0 flex-col gap-2 border-r-[2.5px] border-ink bg-white px-5 py-8 portrait:w-full portrait:flex-row portrait:flex-wrap portrait:border-r-0 portrait:border-b-[2.5px] portrait:py-4">
        <div className="mb-6 flex items-center gap-4 px-1 portrait:mb-0">
          <Logo />
          <h1 className="rounded-full border-2 border-ink bg-lavender px-3.5 py-1.5 text-lg font-bold whitespace-nowrap">
            {c.title}
          </h1>
        </div>
        {SECTIONS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? "page" : undefined}
            data-testid={`crew-nav-${id}`}
            onClick={() => setSection(id)}
            className={`pressable flex min-h-[76px] items-center gap-4 rounded-[18px] border-[2.5px] px-4 py-2 text-left ${section === id ? "border-ink bg-mint-soft" : "border-transparent"}`}
          >
            <Icon size={26} strokeWidth={2.2} className="shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[22px] leading-tight font-bold">{c.nav[id]}</span>
              <span
                className={`truncate text-base font-semibold ${navAlert[id] ? "text-coral-strong" : "text-text-2"}`}
              >
                {navStatus[id]}
              </span>
            </span>
            {id === "printer" && failed.length > 0 && (
              <span className="rounded-full border-2 border-ink bg-coral px-2.5 text-base font-bold">
                {failed.length}
              </span>
            )}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-2 portrait:mt-0">
          <p className="px-1 text-base font-semibold text-text-2">{c.flow.navHint}</p>
          <Button
            className="h-[88px] gap-2 rounded-[20px] px-4 text-xl [--lx:7px] [--under:#fff]"
            data-testid="to-guest"
            onClick={openForGuests}
          >
            {c.toGuest} <ArrowRight size={24} strokeWidth={2.5} />
          </Button>
        </div>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto px-12 pt-9 pb-8 portrait:px-8">
        <header className="flex items-end justify-between gap-6">
          <h2 className="text-[44px] leading-none font-extrabold tracking-[-0.03em]">
            {c.nav[section]}
          </h2>
          <div className="min-w-0 text-right">
            <div className="text-base font-semibold text-text-2">{c.activeEvent}</div>
            <div className="truncate text-2xl font-extrabold">
              {event.name} · {modeLabel}
            </div>
          </div>
        </header>

        {blurWarn && (
          <div
            role="alert"
            className="flex items-center gap-6 rounded-[22px] border-[2.5px] border-ink bg-peach px-7 py-5"
          >
            <Focus size={30} strokeWidth={2.5} className="shrink-0" />
            <p className="flex-1 text-xl font-semibold">{c.blurWarn}</p>
            <Button
              variant="secondary"
              className="h-16 shrink-0 rounded-2xl px-5 text-xl"
              onClick={() => setSection("camera")}
            >
              {c.blurFix}
            </Button>
            <button
              type="button"
              className="shrink-0 text-xl font-bold underline"
              onClick={() => {
                sharpNotes.dismissWarning();
                setBlurWarn(false);
              }}
            >
              {c.blurDismiss}
            </button>
          </div>
        )}

        {content[section]}
        <SaveBar dev={dev} />
      </div>

      {note && (
        <p
          role="status"
          className="layered fixed right-8 bottom-8 z-20 max-w-[620px] rounded-[20px] border-[2.5px] border-ink bg-sky px-6 py-4 text-xl font-semibold [--lx:6px]"
        >
          {note}
        </p>
      )}

      {sheet === "roll" && roll !== null && (
        <Sheet title={c.newRoll} onClose={() => setSheet(null)}>
          <label className="flex flex-col gap-3 text-xl font-semibold text-text-2">
            {c.rollSize}
            <input
              inputMode="numeric"
              value={roll}
              onChange={(e) => setRoll(e.target.value.replace(/\D/g, "").slice(0, 4))}
              className="h-[92px] rounded-[20px] border-[2.5px] border-ink px-6 font-mono text-[40px] text-ink outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
            />
          </label>
          <Button
            className="h-[92px] rounded-[20px] text-[26px]"
            onClick={() => {
              setSheet(null);
              void act(async () => {
                await p.crew.resetPaper(Number(roll));
                setRoll(null);
              })();
            }}
          >
            {c.save}
          </Button>
        </Sheet>
      )}

      {sheet === "update" && (
        <Sheet title={c.update} onClose={() => setSheet(null)}>
          <p className="text-2xl font-medium text-text-2">
            {!update
              ? c.updateChecking
              : update.offline
                ? c.updateOffline
                : update.available && update.latest
                  ? (update.ready ? c.updateReady : c.updateAvailable)(
                      update.latest,
                      update.current,
                    )
                  : update.latest
                    ? c.updateLatest(update.current)
                    : c.updateNone}
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
                  ? c.updateInstalling
                  : dl.total
                    ? `${Math.floor((dl.received / dl.total) * 100)}% · ${Math.round(dl.received / 1e6)} / ${Math.round(dl.total / 1e6)} MB${dl.eta}`
                    : c.updating}
              </p>
            </div>
          )}
          {updErr && (
            <div
              className="rounded-[20px] border-[2.5px] border-ink bg-coral-strong px-6 py-4 text-xl font-semibold text-white"
              role="alert"
            >
              <b>{c.updateFailed}:</b> {updErr}
            </div>
          )}
          {update?.available && !dl && (
            <Button className="h-[92px] rounded-[20px] text-[26px]" onClick={installUpdate}>
              {updErr ? c.updateRetry : c.updateNow}
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
      {galleryQr && (
        <GalleryQr
          url={galleryQr}
          onCopy={act(() => p.crew.galleryLink(event.id), copy.galleryQr.copied)}
          onClose={() => setGalleryQr(null)}
        />
      )}
      {sheet === "exit" && (
        <Sheet title={c.exitConfirm} onClose={() => setSheet(null)}>
          <p className="text-2xl font-medium text-text-2">{c.exitBody}</p>
          <Button
            className="h-[92px] rounded-[20px] bg-coral-strong! text-[26px]"
            onClick={() => {
              setSheet(null);
              void act(() => p.crew.exit())();
            }}
          >
            {c.exitYes}
          </Button>
        </Sheet>
      )}
    </main>
  );
}
