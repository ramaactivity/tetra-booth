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
  Sunny: "Siang",
  Incandescent: "Lampu kuning",
  Cloudy: "Mendung",
  Shade: "Teduh",
  Tungsten: "Lampu kuning",
  Fluorescent: "Lampu neon",
  Flash: "Flash",
};
const human = (s: string) => HUMAN[s] ?? s;

/**
 * Setelan eksposur DSLR (ISO, shutter, aperture, WB, ISO/shutter jepret, kualitas) yang langsung dikirim ke kamera.
 * Dipakai di halaman Kamera mode crew dan di Tes Jepret, supaya efeknya terlihat di live view saat diubah (Rama, W-034).
 * `null` saat kamera tidak punya setelan (webcam, hot folder) kecuali `showEmpty`.
 */
/** Setelan dengan pilihan sebanyak ini (ISO, shutter, aperture) jadi tombol langkah ◀ nilai ▶, bukan chip. */
const STEPPER_MIN = 8;
const stepBtn =
  "pressable flex size-16 shrink-0 items-center justify-center rounded-[16px] border-[2.5px] border-ink bg-white text-2xl font-bold disabled:opacity-30";

/** ◀ nilai ▶: satu ketukan = satu langkah (ISO 1600 → 2000), efeknya langsung terlihat di live view. */
function Stepper({ x, onPick }: { x: CameraProp; onPick: (o: string) => void }) {
  const i = x.options.indexOf(x.value);
  const go = (d: number) => {
    const o = x.options[Math.min(x.options.length - 1, Math.max(0, (i < 0 ? 0 : i) + d))];
    if (o && o !== x.value) onPick(o);
  };
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label={`${x.label} turun`}
        className={stepBtn}
        disabled={i <= 0}
        onClick={() => go(-1)}
      >
        ◀
      </button>
      <span className="flex h-16 min-w-0 flex-1 items-center justify-center rounded-[16px] border-[2.5px] border-ink bg-butter font-mono text-2xl font-bold">
        {x.value ? human(x.value) : "—"}
      </span>
      <button
        type="button"
        aria-label={`${x.label} naik`}
        className={stepBtn}
        disabled={i >= x.options.length - 1}
        onClick={() => go(1)}
      >
        ▶
      </button>
    </div>
  );
}

const HZ_KEY = "tb.flickerHz";
const readHz = (): 50 | 60 => {
  try {
    return localStorage.getItem(HZ_KEY) === "60" ? 60 : 50;
  } catch {
    return 50;
  }
};
/** "1/50" → 0.02, "2\"" → 2; selain itu NaN. */
const seconds = (o: string) => {
  const f = o.match(/^1\/(\d+)$/);
  if (f) return 1 / Number(f[1]);
  const s = o.match(/^([\d.]+)"$/);
  return s ? Number(s[1]) : Number.NaN;
};
/** Pilihan shutter terdekat ke 1/hz (anti kedip lampu: 1/50 untuk listrik 50 Hz/PAL, 1/60 untuk 60 Hz/NTSC). */
export const flickerShutter = (options: string[], hz: 50 | 60) =>
  options
    .filter((o) => !Number.isNaN(seconds(o)))
    .sort((a, b) => Math.abs(Math.log(seconds(a) * hz)) - Math.abs(Math.log(seconds(b) * hz)))[0];

/**
 * Kecerahan monitor (masukan Rama 9 Okt, #233): crew awam tidak perlu tahu ISO/shutter live view. Satu stepper
 * lebih gelap/lebih terang menggeser ISO live view; shutter live view dikunci 1/50 atau 1/60 sesuai listrik lampu
 * (anti kedip). Di balik layar tetap ISO + shutter + bukaan, nilai asli kamera.
 */
function MonitorBrightness({
  iso,
  shutter,
  onSet,
}: {
  iso: CameraProp | undefined;
  shutter: CameraProp | undefined;
  onSet: (name: string, value: string) => void;
}) {
  const [hz, setHz] = useState(readHz);
  const target = shutter && flickerShutter(shutter.options, hz);
  // biome-ignore lint/correctness/useExhaustiveDependencies: kunci sekali tiap target berubah
  useEffect(() => {
    if (shutter && target && shutter.value !== target) onSet(shutter.name, target);
  }, [target]);
  const levels = iso?.options.filter((o) => !/auto|otomatis/i.test(o)) ?? [];
  const i = iso ? levels.indexOf(iso.value) : -1;
  const go = (d: number) => {
    const o =
      levels[
        Math.min(
          levels.length - 1,
          Math.max(0, (i < 0 ? Math.floor(levels.length / 2) - d : i) + d),
        )
      ];
    if (iso && o && o !== iso.value) onSet(iso.name, o);
  };
  const pick = (h: 50 | 60) => {
    try {
      localStorage.setItem(HZ_KEY, String(h));
    } catch {}
    setHz(h);
  };
  return (
    <div className="flex flex-col gap-4" data-testid="monitor-brightness">
      {iso && levels.length > 1 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={copy.crew.darker}
            className={`${stepBtn} w-auto px-4 text-lg`}
            disabled={i === 0}
            onClick={() => go(-1)}
          >
            ◀ {copy.crew.darker}
          </button>
          <div className="flex h-16 min-w-0 flex-1 flex-col justify-center gap-1.5 rounded-[16px] border-[2.5px] border-ink bg-white px-3">
            <div className="flex gap-1" aria-hidden>
              {levels.map((o, k) => (
                <span
                  key={o}
                  className={`h-4 flex-1 rounded-[3px] ${k <= i ? "bg-butter" : "bg-neutral"} ${k === i ? "outline-2 outline-ink" : ""}`}
                />
              ))}
            </div>
            <span className="text-center font-mono text-base font-bold" data-testid="monitor-level">
              {i < 0 ? copy.crew.auto : copy.crew.level(i + 1, levels.length)}
            </span>
          </div>
          <button
            type="button"
            aria-label={copy.crew.brighter}
            className={`${stepBtn} w-auto px-4 text-lg`}
            disabled={i === levels.length - 1}
            onClick={() => go(1)}
          >
            {copy.crew.brighter} ▶
          </button>
        </div>
      )}
      {shutter && (
        <div className="flex flex-wrap items-center gap-2.5">
          <span className={label}>{copy.crew.flicker}</span>
          {([50, 60] as const).map((h) => (
            <button key={h} type="button" className={chip(hz === h)} onClick={() => pick(h)}>
              {h} Hz
            </button>
          ))}
          <span className="text-base text-text-2">{copy.crew.flickerHint}</span>
        </div>
      )}
    </div>
  );
}

/** Kelompok di Tes Jepret: apa yang dilihat tamu, apa yang dipakai saat foto, sisanya (masukan Rama W-034). */
const GROUPS: { title: string; hint?: string; names: string[] }[] = [
  { title: copy.crew.groupLive, hint: copy.crew.groupLiveHint, names: ["iso", "shutterspeed"] },
  {
    title: copy.crew.groupShot,
    hint: copy.crew.groupShotHint,
    names: ["iso_capture", "shutter_capture"],
  },
  { title: copy.crew.groupOther, names: [] },
];

export function CameraProps({
  onNote,
  showEmpty = false,
  grouped = false,
}: {
  onNote: (m: string) => void;
  showEmpty?: boolean;
  /** Tampil berkelompok (Tes Jepret); baterai jadi satu baris di atas. */
  grouped?: boolean;
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
  const row = (x: CameraProp) => (
    <div key={x.name} className="flex flex-col gap-1.5" data-testid={`camera-prop-${x.name}`}>
      <span className={label}>
        {human(x.label)} · <span className="font-mono">{x.value ? human(x.value) : "—"}</span>
      </span>
      {grouped && x.options.length > STEPPER_MIN ? (
        <Stepper x={x} onPick={(o) => void setProp(x.name, o)} />
      ) : (
        x.options.length > 0 && (
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
        )
      )}
    </div>
  );
  if (!grouped) return <>{props.map(row)}</>;
  const known = GROUPS.flatMap((g) => g.names);
  const battery = props.find((x) => x.name === "battery");
  return (
    <>
      {battery && (
        <p className="text-lg font-semibold text-text-2" data-testid="camera-prop-battery">
          {human(battery.label)} · <span className="font-mono">{battery.value}</span>
        </p>
      )}
      {GROUPS.map((g) => {
        const items = props.filter((x) =>
          g.names.length
            ? g.names.includes(x.name)
            : !known.includes(x.name) && x.name !== "battery",
        );
        if (!items.length) return null;
        return (
          <section
            key={g.title}
            className="flex flex-col gap-4 border-t-2 border-dashed border-line-soft pt-5 first:border-0 first:pt-0"
          >
            <div>
              <h3 className="text-2xl font-extrabold">{g.title}</h3>
              {g.hint && <p className="mt-1 text-lg text-text-2">{g.hint}</p>}
            </div>
            {g.names.includes("iso") ? (
              <MonitorBrightness
                iso={items.find((x) => x.name === "iso")}
                shutter={items.find((x) => x.name === "shutterspeed")}
                onSet={(n, v) => void setProp(n, v)}
              />
            ) : (
              items.map(row)
            )}
          </section>
        );
      })}
    </>
  );
}
