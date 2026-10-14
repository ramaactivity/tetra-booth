import type { Paper } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { useCallback, useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { DeviceInfo, DeviceSettings, FoundHub, PrintShareInfo } from "../platform";
import { btn, Choice, Panel, Pill, Row, ToggleRow } from "./parts";

const d = copy.crew.dev;

/** Merek kamera yang bisa dipilih crew; hot folder hanya muncul kalau teknisi memakainya (#168). */
const CAMERAS = ["canon", "nikon", "sony", "lumix", "webcam", "simulated"] as const;
type CameraKind = NonNullable<DeviceSettings["camera"]>;
/** Kamera lewat SDK di Camera Service: punya AF sebelum jepret & setelan dari booth. */
const SDK: readonly CameraKind[] = ["canon", "nikon", "sony", "lumix"];

/** Nilai bawaan tiap setelan (sama dengan main), supaya "belum diisi" tidak dianggap perubahan. */
const DEFAULTS: DeviceSettings = {
  mirrorLiveView: true,
  mirrorPhoto: true,
  afBeforeCapture: false,
  role: "booth",
};
const KEYS = Object.keys(d.changed) as (keyof typeof d.changed)[];
const value = (s: DeviceSettings, k: keyof DeviceSettings) => s[k] ?? DEFAULTS[k];
/** Objek (laptop printer tujuan) dibandingkan isinya, bukan referensinya. */
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** Label "belum diuji" & tips menu kamera per merek (sumbernya tetap satu di copy.crew). */
const UNTESTED: Partial<Record<CameraKind, string>> = {
  sony: copy.crew.sonyUntested,
  lumix: copy.crew.lumixUntested,
  nikon: copy.crew.nikonUntested,
};
const TIPS: Partial<Record<CameraKind, readonly string[]>> = {
  canon: d.canonTips,
  sony: copy.crew.sonyTips,
  lumix: copy.crew.lumixTips,
  nikon: copy.crew.nikonTips,
};

/**
 * Pengaturan perangkat dari mode crew (DECISIONS #85) sebagai draf bersama halaman Kamera, Printer, dan Sistem.
 * Simpan = booth ditutup lalu dibuka ulang (main), jadi semua perubahan disimpan sekaligus lewat satu bar.
 */
export function useDevice(onNote: (m: string) => void) {
  const p = usePlatform();
  const [info, setInfo] = useState<DeviceInfo>();
  const [draft, setDraft] = useState<DeviceSettings>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    p.crew.device().then(
      (x) => {
        setInfo(x);
        setDraft(x.now);
      },
      (e: unknown) => onNote(crewText(e)),
    );
  }, [p, onNote]);
  const changes = info ? KEYS.filter((k) => !same(value(draft, k), value(info.now, k))) : [];
  return {
    info,
    draft,
    busy,
    changes,
    /** Belum dimuat = terkunci (tidak bisa diubah sebelum tahu keadaannya). */
    locked: useCallback((k: string) => info?.locked.includes(k) ?? true, [info]),
    set: (patch: DeviceSettings) => setDraft((x) => ({ ...x, ...patch })),
    reset: () => info && setDraft(info.now),
    save: () => {
      setBusy(true);
      onNote(copy.crew.deviceRestarting);
      p.crew.saveDevice(draft).catch((e: unknown) => {
        setBusy(false);
        onNote(crewText(e));
      });
    },
  };
}
export type Device = ReturnType<typeof useDevice>;

/** Bar simpan di bawah halaman: hanya muncul saat ada perubahan, menyebut apa yang berubah dan akibatnya. */
export function SaveBar({ dev }: { dev: Device }) {
  if (!dev.changes.length) return null;
  return (
    <div
      data-testid="device-savebar"
      className="layered sticky bottom-0 z-[5] flex items-center gap-6 rounded-[24px] border-[2.5px] border-ink bg-butter px-7 py-5 [--lx:6px]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-2xl font-extrabold">{d.saveTitle}</span>
        <span className="text-lg font-semibold">
          {dev.changes.map((k) => d.changed[k]).join(" · ")}. {d.saveHint}
        </span>
      </div>
      <Button variant="plain" className={btn} disabled={dev.busy} onClick={dev.reset}>
        {copy.crew.cancel}
      </Button>
      <Button variant="secondary" className={`${btn} px-10`} disabled={dev.busy} onClick={dev.save}>
        {copy.crew.deviceSave}
      </Button>
    </div>
  );
}

const lockedHint = (on: boolean) => (on ? d.locked : undefined);

/** Halaman Kamera: merek yang dipakai, webcam/hot folder, tips menu kamera. */
export function CameraChoice({ dev }: { dev: Device }) {
  const [webcams, setWebcams] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((ds) => setWebcams(ds.filter((x) => x.kind === "videoinput")))
      .catch(() => {});
  }, []);
  const camera = dev.draft.camera ?? "webcam";
  const locked = dev.locked("camera");
  const kinds: CameraKind[] = camera === "hotfolder" ? [...CAMERAS, "hotfolder"] : [...CAMERAS];
  const tips = TIPS[camera];
  return (
    <Panel title={d.cameraTitle} hint={lockedHint(locked) ?? d.cameraHint} testId="camera-choice">
      <div className="grid grid-cols-3 gap-4 portrait:grid-cols-2">
        {kinds.map((k) => (
          <Choice
            key={k}
            testId={`camera-kind-${k}`}
            title={d.choice[k].title}
            detail={d.choice[k].detail}
            tag={UNTESTED[k] ? d.untestedTag : undefined}
            selected={camera === k}
            disabled={locked}
            onClick={() => dev.set({ camera: k })}
          />
        ))}
      </div>
      {camera === "webcam" && (
        <div className="flex flex-col gap-3">
          <span className="text-xl font-bold">{d.webcamTitle}</span>
          {webcams.length ? (
            <div className="grid grid-cols-2 gap-3">
              {webcams.map((w, i) => (
                <Choice
                  key={w.deviceId || i}
                  title={w.label || `${d.choice.webcam.title} ${i + 1}`}
                  selected={(dev.draft.webcamId ?? webcams[0]?.deviceId) === w.deviceId}
                  onClick={() => dev.set({ webcamId: w.deviceId })}
                />
              ))}
            </div>
          ) : (
            <p className="text-lg text-text-2">{copy.crew.noWebcam}</p>
          )}
        </div>
      )}
      {camera === "hotfolder" && (
        <div className="grid grid-cols-2 gap-4">
          {(
            [
              ["hotFolder", "hot-folder", copy.crew.hotFolder],
              ["hotFolderTrigger", "hot-folder-trigger", copy.crew.hotFolderTrigger],
            ] as const
          ).map(([k, flag, label]) => (
            <label key={k} className="flex flex-col gap-1.5">
              <span className="text-lg font-bold text-text-2">{label}</span>
              <input
                className="h-16 w-full rounded-[14px] border-[2.5px] border-ink bg-white px-4 font-mono text-lg disabled:opacity-40"
                disabled={dev.locked(flag)}
                value={dev.draft[k] ?? ""}
                onChange={(e) => dev.set({ [k]: e.target.value })}
              />
            </label>
          ))}
        </div>
      )}
      {tips && (
        <details className="group rounded-[18px] border-2 border-ink bg-paper px-5 py-4">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between text-xl font-bold">
            {d.howTo(d.choice[camera].title)}
            <span className="text-lg font-semibold text-text-2 group-open:hidden">{d.open}</span>
            <span className="hidden text-lg font-semibold text-text-2 group-open:inline">
              {d.close}
            </span>
          </summary>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-6 text-lg font-medium">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
        </details>
      )}
    </Panel>
  );
}

/** Cermin & AF sebelum jepret: ikut draf perangkat (disimpan bersama kamera). */
export function CameraView({ dev }: { dev: Device }) {
  const camera = dev.draft.camera ?? "webcam";
  const flip = (k: "mirrorLiveView" | "mirrorPhoto") => {
    const on = !!value(dev.draft, k);
    return (
      <ToggleRow
        testId={`toggle-${k}`}
        label={d.mirror[k].label}
        hint={d.mirror[k].hint}
        on={on}
        onLabel={copy.crew.on}
        offLabel={copy.crew.off}
        disabled={!dev.info}
        onClick={() => dev.set({ [k]: !on })}
      />
    );
  };
  return (
    <Panel title={d.viewTitle}>
      <div className="flex flex-col gap-4">
        {flip("mirrorLiveView")}
        {flip("mirrorPhoto")}
        {SDK.includes(camera) && (
          <ToggleRow
            testId="toggle-afBeforeCapture"
            label={copy.crew.afBeforeCapture}
            hint={d.afHint}
            on={!!dev.draft.afBeforeCapture}
            onLabel={copy.crew.on}
            offLabel={copy.crew.off}
            disabled={!dev.info}
            onClick={() => dev.set({ afBeforeCapture: !dev.draft.afBeforeCapture })}
          />
        )}
      </div>
    </Panel>
  );
}

/** Halaman Printer: printer Windows yang dipakai + pengingat potong 2 inci untuk layout event aktif. */
export function PrinterChoice({
  dev,
  paper,
  onSettings,
}: {
  dev: Device;
  paper: Paper;
  onSettings: () => void;
}) {
  const locked = dev.locked("printer");
  const printers = dev.info?.printers ?? [];
  return (
    <Panel title={d.printerTitle} hint={lockedHint(locked) ?? d.printerHint}>
      {dev.info && !printers.length ? (
        <p className="rounded-[18px] border-2 border-dashed border-ink bg-coral px-5 py-4 text-xl font-semibold">
          {copy.crew.noPrinter}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {printers.map((name) => {
            // Antrean offline ditandai, port fisik ditampilkan (audit B04: "DS-RX1" vs "DS-RX1 (Copy 2)").
            // Port virtual ("nul:", "PORTPROMPT:") tidak ditampilkan.
            const q = dev.info?.printerQueues?.[name];
            const port = q?.port && !q.port.endsWith(":") ? q.port : undefined;
            return (
              <Choice
                key={name}
                testId="printer-choice"
                title={name}
                detail={port ? copy.crew.printerPort(port) : undefined}
                tag={q?.offline ? copy.crew.printerOffline : undefined}
                selected={dev.draft.printer === name}
                disabled={locked}
                onClick={() => dev.set({ printer: name })}
              />
            );
          })}
        </div>
      )}
      <Row label={d.cutTitle} hint={paper === "2x6x2" ? copy.crew.cutOn : copy.crew.cutOff}>
        <Button
          variant="secondary"
          className={btn}
          disabled={!dev.info?.now.printer}
          onClick={onSettings}
        >
          {copy.crew.printerSettings}
        </Button>
      </Row>
    </Panel>
  );
}

/** Halaman Sistem: laptop ini untuk booth tamu atau Photo Stage (#178). */
export function RoleChoice({ dev }: { dev: Device }) {
  const locked = dev.locked("role");
  const role = dev.draft.role ?? "booth";
  return (
    <Panel title={copy.crew.deviceRole} hint={lockedHint(locked) ?? d.roleHint}>
      <div className="grid grid-cols-3 gap-4">
        {(["booth", "stage", "print"] as const).map((r) => (
          <Choice
            key={r}
            testId={`role-${r}`}
            title={copy.crew.roles[r]}
            detail={d.roleDetail[r]}
            selected={role === r}
            disabled={!dev.info || locked}
            onClick={() => dev.set({ role: r })}
          />
        ))}
      </div>
    </Panel>
  );
}

const sh = d.share;

/**
 * Printer bersama (#261) di halaman Printer: pilih peran printer laptop ini. Pusat menampilkan kode & booth yang
 * tersambung; booth pengirim mencari laptop printer di WiFi yang sama, cek kode, lalu Simpan lewat bar yang sama.
 */
export function PrintSharePanel({
  dev,
  info,
  onNote,
}: {
  dev: Device;
  info: PrintShareInfo | undefined;
  onNote: (m: string) => void;
}) {
  const p = usePlatform();
  const mode = dev.draft.printShare ?? "local";
  const saved = dev.info?.now.printShare ?? "local";
  const [hubs, setHubs] = useState<FoundHub[] | null>(null);
  const [pick, setPick] = useState<FoundHub>();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [finder, setFinder] = useState(false);
  const find = useCallback(() => {
    setBusy(true);
    setHubs(null);
    p.crew
      .findHubs()
      .then(
        (h) => {
          setHubs(h);
          setPick(h.length === 1 ? h[0] : undefined);
        },
        (e: unknown) => onNote(crewText(e)),
      )
      .finally(() => setBusy(false));
  }, [p, onNote]);
  const choose = (m: NonNullable<DeviceSettings["printShare"]>) => {
    dev.set({ printShare: m });
    // Pindah ke "Kirim ke laptop printer" tanpa tujuan tersimpan: langsung cari, crew tidak perlu menekan apa-apa.
    if (m === "remote" && !dev.draft.printHub) {
      setFinder(true);
      find();
    }
  };
  const connect = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await p.crew.checkHub(pick.url, code);
      if (r === "badkey") return onNote(sh.badKey);
      if (r === null) return onNote(sh.unreachable(pick.name));
      dev.set({
        printShare: "remote",
        printHub: { id: r.id, name: r.name, key: code, url: pick.url },
      });
      setFinder(false);
      onNote(sh.checked(r.name));
    } catch (e) {
      onNote(crewText(e));
    } finally {
      setBusy(false);
    }
  };
  const target = dev.draft.printHub;
  const live = info?.mode === "remote" && same(target, dev.info?.now.printHub) ? info : undefined;
  return (
    <Panel title={sh.title} hint={sh.hint} testId="print-share">
      <div className="grid grid-cols-3 gap-4 portrait:grid-cols-1">
        {(["local", "hub", "remote"] as const).map((m) => (
          <Choice
            key={m}
            testId={`share-${m}`}
            title={sh.mode[m].title}
            detail={sh.mode[m].detail}
            selected={mode === m}
            disabled={!dev.info || busy}
            onClick={() => choose(m)}
          />
        ))}
      </div>
      {mode === "hub" &&
        (saved === "hub" && info?.mode === "hub" ? (
          <div className="flex flex-col gap-4" data-testid="share-hub">
            <div className="flex items-center gap-6 rounded-[20px] border-[2.5px] border-ink bg-butter px-6 py-5">
              <div className="flex flex-col">
                <span className="text-lg font-bold text-text-2">{sh.code}</span>
                <span
                  data-testid="share-key"
                  className="font-mono text-[56px] leading-none font-extrabold"
                >
                  {info.key}
                </span>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-xl font-bold">{sh.hubName(info.name)}</span>
                <span className="text-lg font-medium text-text-2">
                  {sh.howTo(info.name, info.key)}
                </span>
                {info.urls.length > 0 && (
                  <span className="font-mono text-base text-text-2">{info.urls.join(" · ")}</span>
                )}
              </div>
            </div>
            <Row
              label={sh.peers}
              hint={
                info.peers.length ? (
                  <span className="flex flex-col gap-1">
                    {info.peers.map((x) => (
                      <span key={x.name} data-testid="share-peer">
                        <strong className="text-ink">{x.name}</strong> ·{" "}
                        {x.secAgo > 60 ? sh.stale : sh.ago(x.secAgo)}
                      </span>
                    ))}
                  </span>
                ) : (
                  sh.noPeers
                )
              }
            />
          </div>
        ) : (
          <p className="text-lg font-semibold text-text-2">{sh.saveFirst}</p>
        ))}
      {mode === "remote" && target && !finder && (
        <Row
          testId="share-target"
          label={
            <span className="flex flex-wrap items-center gap-3">
              {sh.target}: {target.name}
              {live && (
                <Pill tone={live.state === "ok" ? "mint" : "coral"}>{sh.state[live.state]}</Pill>
              )}
            </span>
          }
          hint={
            live
              ? sh.pending(live.pending)
              : saved === "remote"
                ? undefined
                : sh.checked(target.name)
          }
        >
          <Button
            variant="secondary"
            className={btn}
            disabled={busy}
            onClick={() => (setFinder(true), find())}
          >
            {sh.change}
          </Button>
        </Row>
      )}
      {mode === "remote" && (finder || !target) && (
        <div className="flex flex-col gap-4" data-testid="share-finder">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xl font-bold">{sh.found}</span>
            <Button variant="secondary" className={btn} disabled={busy} onClick={find}>
              {busy && !hubs ? sh.finding : sh.find}
            </Button>
          </div>
          {hubs && !hubs.length && (
            <p className="rounded-[18px] border-2 border-dashed border-ink bg-peach px-5 py-4 text-lg font-semibold">
              {sh.noneFound}
            </p>
          )}
          {!!hubs?.length && (
            <div className="grid grid-cols-2 gap-3 portrait:grid-cols-1">
              {hubs.map((h) => (
                <Choice
                  key={h.id}
                  testId="share-hub-choice"
                  title={h.name}
                  detail={h.url.replace(/^http:\/\//, "")}
                  selected={pick?.id === h.id}
                  onClick={() => setPick(h)}
                />
              ))}
            </div>
          )}
          {pick && (
            <div className="flex items-end gap-4">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-lg font-bold text-text-2">{sh.codeHint}</span>
                <input
                  data-testid="share-code"
                  inputMode="numeric"
                  maxLength={4}
                  className="h-16 w-full rounded-[14px] border-[2.5px] border-ink bg-white px-4 font-mono text-3xl tracking-[0.3em]"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </label>
              <Button
                className={`${btn} [--lx:6px]`}
                disabled={busy || code.length !== 4}
                onClick={() => void connect()}
              >
                {sh.connect}
              </Button>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
