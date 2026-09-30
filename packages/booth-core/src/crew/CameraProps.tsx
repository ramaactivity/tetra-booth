import { useEffect, useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import type { CameraProp } from "../platform";

const chip = (on: boolean) =>
  `min-h-14 rounded-full border-2 border-ink px-5 font-mono text-lg ${on ? "bg-butter font-bold" : "bg-white"}`;
const label = "text-lg font-bold text-text-2";

/** Nama setelan & nilai kamera (bahasa Inggris dari kamera) dalam bahasa crew; nilai asli tetap dikirim ke kamera. */
const HUMAN: Record<string, string> = {
  "White balance": "Warna cahaya (WB)",
  Aperture: "Bukaan lensa",
  Auto: "Otomatis",
  Daylight: "Siang",
  Cloudy: "Mendung",
  Shade: "Teduh",
  Tungsten: "Lampu kuning",
  Fluorescent: "Lampu neon",
  Flash: "Flash",
};
const human = (s: string) => HUMAN[s] ?? s;

/**
 * Setelan eksposur DSLR (ISO, shutter, aperture, WB, ISO/shutter jepret, kualitas) yang langsung dikirim ke kamera.
 * Dipakai di sheet Kamera & Printer dan di Tes Jepret, supaya efeknya terlihat di live view saat diubah (Rama, W-034).
 * `null` saat kamera tidak punya setelan (webcam, hot folder biasa) kecuali `showEmpty`.
 */
export function CameraProps({
  onNote,
  showEmpty = false,
}: {
  onNote: (m: string) => void;
  showEmpty?: boolean;
}) {
  const p = usePlatform();
  const [props, setProps] = useState<CameraProp[] | null>(null);

  useEffect(() => {
    p.crew.cameraProps().then(setProps, () => setProps([]));
  }, [p]);

  const setProp = async (name: string, value: string) => {
    try {
      await p.crew.setCameraProp(name, value);
      setProps((ps) => ps?.map((x) => (x.name === name ? { ...x, value } : x)) ?? ps);
    } catch (e) {
      onNote(crewText(e));
    }
  };

  if (props === null) return <p className="text-lg text-text-2">…</p>;
  if (!props.length)
    return showEmpty ? <p className="text-lg text-text-2">{copy.crew.noExposure}</p> : null;
  return (
    <>
      {props.map((x) => (
        <div key={x.name} className="flex flex-col gap-1.5" data-testid={`camera-prop-${x.name}`}>
          <span className={label}>
            {human(x.label)} · <span className="font-mono">{x.value ? human(x.value) : "—"}</span>
          </span>
          {x.options.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {x.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={chip(o === x.value)}
                  onClick={() => void setProp(x.name, o)}
                >
                  {human(o)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
