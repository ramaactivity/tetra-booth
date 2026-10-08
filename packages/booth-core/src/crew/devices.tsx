import type { Paper } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { useCallback, useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { DeviceInfo, DeviceSettings } from "../platform";
import { btn, Choice, Panel, Row, ToggleRow } from "./parts";

const d = copy.crew.dev;

/** Merek kamera yang bisa dipilih crew; hot folder hanya muncul kalau teknisi memakainya (#168). */
const CAMERAS = ["canon", "nikon", "sony", "lumix", "webcam", "simulated"] as const;
type CameraKind = NonNullable<DeviceSettings["camera"]>;
/** Kamera lewat SDK di Camera Service: punya AF sebelum jepret & setelan dari booth. */
const SDK: readonly CameraKind[] = ["canon", "nikon", "sony", "lumix"];

/** Nilai bawaan tiap setelan (sama dengan main), supaya "belum diisi" tidak dianggap perubahan. */
const DEFAULTS: DeviceSettings = {
  mirrorLiveView: true,
  mirrorPhoto: false,
  afBeforeCapture: false,
  role: "booth",
};
const KEYS = Object.keys(d.changed) as (keyof typeof d.changed)[];
const value = (s: DeviceSettings, k: keyof DeviceSettings) => s[k] ?? DEFAULTS[k];
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
  const changes = info ? KEYS.filter((k) => value(draft, k) !== value(info.now, k)) : [];
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
          {printers.map((name) => (
            <Choice
              key={name}
              testId="printer-choice"
              title={name}
              selected={dev.draft.printer === name}
              disabled={locked}
              onClick={() => dev.set({ printer: name })}
            />
          ))}
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
