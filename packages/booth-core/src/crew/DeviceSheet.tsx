import type { Paper } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { DeviceInfo, DeviceSettings } from "../platform";
import { Sheet } from "./Sheet";

/** digiCamControl dipensiunkan (#141): DSLR Canon = EDSDK; hot folder hanya lewat flag teknisi. */
const CAMERAS = ["canon", "webcam", "simulated"] as const;

const choice = (on: boolean) =>
  `pressable flex min-h-[72px] items-center justify-center rounded-[18px] border-[2.5px] border-ink px-6 py-2 text-center text-xl leading-tight font-bold disabled:opacity-40 ${on ? "bg-mint-soft" : "bg-white"}`;
const input =
  "h-16 w-full rounded-[14px] border-[2.5px] border-ink bg-white px-4 font-mono text-lg disabled:opacity-40";
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
  }, [p, onNote]);

  const locked = (k: string) => info?.locked.includes(k) ?? true;
  const set = (patch: DeviceSettings) => setDraft((d) => ({ ...d, ...patch }));
  const changed = info && JSON.stringify(draft) !== JSON.stringify(info.now);
  const camera = draft.camera ?? "webcam";

  // DSLR (digiCamControl / Canon EDSDK): AF sebelum jepret. Setelan eksposur ada di halaman Kamera & Tes Jepret.
  const dslr = (
    <>
      <button
        type="button"
        aria-pressed={!!draft.afBeforeCapture}
        disabled={!info}
        className={choice(!!draft.afBeforeCapture)}
        onClick={() => set({ afBeforeCapture: !draft.afBeforeCapture })}
      >
        {copy.crew.afBeforeCapture} · {draft.afBeforeCapture ? copy.crew.on : copy.crew.off}
      </button>
    </>
  );

  return (
    <Sheet title={copy.crew.device} onClose={onClose}>
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto pr-1">
        <section className="flex flex-col gap-3">
          <p className={label}>
            {copy.crew.deviceCamera}
            {locked("camera") && ` · ${copy.crew.deviceLocked}`}
          </p>
          <div className="grid grid-cols-2 gap-3">
            {CAMERAS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={locked("camera")}
                className={choice(camera === c)}
                onClick={() => set({ camera: c })}
              >
                {copy.crew.cameraKind[c]}
              </button>
            ))}
          </div>

          {camera === "canon" && (
            <div className="flex flex-col gap-3">
              <p className="text-lg text-text-2">{copy.crew.canonNote}</p>
              {dslr}
            </div>
          )}

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
                  placeholder={copy.crew.hotFolderFromDcc}
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
              {dslr}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <p className={label}>{copy.crew.mirror}</p>
          <div className="grid grid-cols-2 gap-3">
            {(["mirrorLiveView", "mirrorPhoto"] as const).map((k) => {
              const on = draft[k] ?? k === "mirrorLiveView";
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  disabled={!info}
                  className={choice(on)}
                  onClick={() => set({ [k]: !on })}
                >
                  {copy.crew[k]} · {on ? copy.crew.on : copy.crew.off}
                </button>
              );
            })}
          </div>
          {draft.mirrorPhoto && <p className="text-lg text-text-2">{copy.crew.mirrorNote}</p>}
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
      {!changed && <p className="-mt-2 text-center text-lg text-text-2">{copy.crew.noChange}</p>}
    </Sheet>
  );
}
