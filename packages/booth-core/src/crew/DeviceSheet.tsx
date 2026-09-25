import type { Paper } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { CameraProp, DeviceInfo, DeviceSettings } from "../platform";
import { Sheet } from "./Sheet";

const DEFAULT_HOT = "C:\\TetraBooth\\hot";
const DEFAULT_TRIGGER = "http://localhost:5513/?CMD=Capture";
const CAMERAS = ["webcam", "hotfolder", "simulated"] as const;

const choice = (on: boolean) =>
  `pressable flex min-h-[72px] items-center justify-center rounded-[18px] border-[2.5px] border-ink px-4 text-center text-xl font-bold disabled:opacity-40 ${on ? "bg-mint-soft" : "bg-white"}`;
const chip = (on: boolean) =>
  `h-12 shrink-0 rounded-full border-2 border-ink px-4 font-mono text-lg ${on ? "bg-butter font-bold" : "bg-white"}`;
const input =
  "h-14 w-full rounded-[14px] border-[2.5px] border-ink bg-white px-4 font-mono text-lg disabled:opacity-40";
const label = "text-lg font-bold text-text-2";

/**
 * Kamera & printer dari mode crew (DECISIONS #85): sumber kamera, webcam, hot folder + pemicu digiCamControl,
 * setelan eksposur DSLR (langsung berlaku), printer + pengingat 2inch cut. Simpan = booth dibuka ulang.
 */
export function DeviceSheet({
  paper,
  onNote,
  onClose,
}: {
  /** Mode printer layout event aktif, untuk pengingat potong 2 inci (M-022). */
  paper: Paper;
  onNote: (m: string) => void;
  onClose: () => void;
}) {
  const p = usePlatform();
  const [info, setInfo] = useState<DeviceInfo>();
  const [draft, setDraft] = useState<DeviceSettings>({});
  const [webcams, setWebcams] = useState<MediaDeviceInfo[]>([]);
  const [props, setProps] = useState<CameraProp[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    p.crew.device().then(
      (d) => {
        setInfo(d);
        setDraft(d.now);
      },
      (e: unknown) => onNote(crewText(e)),
    );
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((ds) => setWebcams(ds.filter((d) => d.kind === "videoinput")))
      .catch(() => {});
    p.crew.cameraProps().then(setProps, () => setProps([]));
  }, [p, onNote]);

  const locked = (k: string) => info?.locked.includes(k) ?? true;
  const set = (patch: DeviceSettings) => setDraft((d) => ({ ...d, ...patch }));
  const changed = info && JSON.stringify(draft) !== JSON.stringify(info.now);
  const running = info?.now.camera;
  const camera = draft.camera ?? "webcam";

  const setProp = async (name: string, value: string) => {
    try {
      await p.crew.setCameraProp(name, value);
      setProps((ps) => ps?.map((x) => (x.name === name ? { ...x, value } : x)) ?? ps);
    } catch (e) {
      onNote(crewText(e));
    }
  };

  return (
    <Sheet title={copy.crew.device} onClose={onClose}>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pr-1">
        <section className="flex flex-col gap-3">
          <p className={label}>
            {copy.crew.deviceCamera}
            {locked("camera") && ` · ${copy.crew.deviceLocked}`}
          </p>
          <div className="grid grid-cols-3 gap-3">
            {CAMERAS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={locked("camera")}
                className={choice(camera === c)}
                onClick={() =>
                  set(
                    c === "hotfolder"
                      ? {
                          camera: c,
                          hotFolder: draft.hotFolder ?? DEFAULT_HOT,
                          hotFolderTrigger: draft.hotFolderTrigger ?? DEFAULT_TRIGGER,
                        }
                      : { camera: c },
                  )
                }
              >
                {copy.crew.cameraKind[c]}
              </button>
            ))}
          </div>

          {camera === "webcam" && (
            <div className="flex flex-col gap-2">
              {webcams.map((w, i) => (
                <button
                  key={w.deviceId || i}
                  type="button"
                  className={choice((draft.webcamId ?? webcams[0]?.deviceId) === w.deviceId)}
                  onClick={() => set({ webcamId: w.deviceId })}
                >
                  {w.label || `${copy.crew.cameraKind.webcam} ${i + 1}`}
                </button>
              ))}
              {!webcams.length && <p className="text-lg text-text-2">{copy.crew.noWebcam}</p>}
            </div>
          )}

          {camera === "hotfolder" && (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className={label}>{copy.crew.hotFolder}</span>
                <input
                  className={input}
                  disabled={locked("hot-folder")}
                  value={draft.hotFolder ?? ""}
                  onChange={(e) => set({ hotFolder: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className={label}>{copy.crew.hotFolderTrigger}</span>
                <input
                  className={input}
                  disabled={locked("hot-folder-trigger")}
                  value={draft.hotFolderTrigger ?? ""}
                  onChange={(e) => set({ hotFolderTrigger: e.target.value })}
                />
              </label>
              {running === "hotfolder" &&
                (props === null ? (
                  <p className="text-lg text-text-2">…</p>
                ) : props.length ? (
                  props.map((x) => (
                    <div key={x.name} className="flex flex-col gap-1.5">
                      <span className={label}>
                        {x.label} · <span className="font-mono">{x.value || "—"}</span>
                      </span>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {x.options.map((o) => (
                          <button
                            key={o}
                            type="button"
                            className={chip(o === x.value)}
                            onClick={() => void setProp(x.name, o)}
                          >
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-lg text-text-2">{copy.crew.noExposure}</p>
                ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <p className={label}>
            {copy.crew.devicePrinter}
            {locked("printer") && ` · ${copy.crew.deviceLocked}`}
          </p>
          <div className="flex flex-col gap-2">
            {info?.printers.map((name) => (
              <button
                key={name}
                type="button"
                disabled={locked("printer")}
                className={choice(draft.printer === name)}
                onClick={() => set({ printer: name })}
              >
                {name}
              </button>
            ))}
            {info && !info.printers.length && (
              <p className="text-lg text-text-2">{copy.crew.noPrinter}</p>
            )}
          </div>
          <p className="rounded-[18px] border-[2.5px] border-dashed border-ink bg-paper px-5 py-4 text-xl font-semibold">
            {paper === "2x6x2" ? copy.crew.cutOn : copy.crew.cutOff}
          </p>
          <Button
            variant="secondary"
            className="h-[76px] rounded-[18px] text-xl"
            disabled={!info?.now.printer}
            onClick={() =>
              p.crew.printerSettings().then(
                () => onNote(copy.crew.printerSettingsDone),
                (e: unknown) => onNote(crewText(e)),
              )
            }
          >
            {copy.crew.printerSettings}
          </Button>
        </section>
      </div>

      <Button
        className="h-[92px] shrink-0 rounded-[20px] text-[26px]"
        disabled={!changed || busy}
        onClick={() => {
          setBusy(true);
          onNote(copy.crew.deviceRestarting);
          p.crew.saveDevice(draft).catch((e: unknown) => {
            setBusy(false);
            onNote(crewText(e));
          });
        }}
      >
        {copy.crew.deviceSave}
      </Button>
    </Sheet>
  );
}
