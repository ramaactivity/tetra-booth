import type { BoothConfig } from "@tetra/platform-electron";
import { DIGICAM_TRIGGER } from "./digicam";

/** Flag yang butuh nilai. Diterima `--nama=nilai` maupun `--nama nilai` (M-008). */
export const VALUE_FLAGS = [
  "camera",
  "size",
  "shots",
  "data",
  "camera-service",
  "printer",
  "paper-4r",
  "paper-2x6x2",
  "print-to-file",
  "hot-folder",
  "metrics-every",
  "paper-fit",
  "hot-folder-trigger",
  "print-offset",
  "printer-2x6x2",
  "digicam-exe",
] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];

/** Parse argv jadi { nilai, boolean }. Flag nilai tanpa nilai dilaporkan di `missing`. */
export function parseFlags(argv: readonly string[]) {
  const values = new Map<string, string>();
  const bools = new Set<string>();
  const missing: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (!a.startsWith("--")) continue;
    const eq = a.indexOf("=");
    const name = a.slice(2, eq < 0 ? undefined : eq);
    if (eq >= 0) values.set(name, a.slice(eq + 1));
    else if ((VALUE_FLAGS as readonly string[]).includes(name)) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        values.set(name, next);
        i++;
      } else missing.push(name);
    } else bools.add(name);
  }
  return {
    value: (name: ValueFlag) => values.get(name) || undefined,
    has: (name: string) => bools.has(name) || values.has(name),
    missing,
  };
}

/**
 * Flag baris perintah (uji & dev). Contoh:
 *   electron apps/booth --camera=simulated --demo --size 1080x1920 --printer "Microsoft Print to PDF" --data C:/tmp/data
 */
const flags = parseFlags(process.argv);
/** Dicatat di index setelah log file aktif. */
export const flagWarnings = flags.missing.map((m) => `[config] --${m} butuh nilai, diabaikan`);

/** Kiosk (M5): default aktif di app hasil build; `--kiosk` / `--no-kiosk` memaksa. */
export const kioskFlag = (isPackaged: boolean) =>
  flags.has("kiosk") || (isPackaged && !flags.has("no-kiosk"));

/**
 * `--digicam`: kamera DSLR lewat digiCamControl (lihat digicam.ts). Menyiratkan `--camera=hotfolder`,
 * pemicu shutter ke web server digiCamControl, buka aplikasinya otomatis, dan live view.
 * `--digicam-exe` untuk lokasi CameraControl.exe yang tidak standar.
 */
export const digicam = flags.has("digicam") ? { exe: flags.value("digicam-exe") } : undefined;

export const config: BoothConfig = {
  camera: digicam
    ? "hotfolder"
    : ((["simulated", "hotfolder"] as const).find((c) => c === flags.value("camera")) ?? "webcam"),
  liveView: !!digicam,
  demo: flags.has("demo"),
  fast: flags.has("fast"),
  guestUrl: process.env.TETRA_GUEST_URL ?? "https://booth.tetraphoto.com",
};

const size = /^(\d+)x(\d+)$/.exec(flags.value("size") ?? "");
export const windowSize = size
  ? { width: Number(size[1]), height: Number(size[2]) }
  : { width: 1280, height: 720 };

/** Folder screenshot per fase (uji jarak jauh tanpa melihat layar). */
export const shotsDir = flags.value("shots");

/** Folder data lokal pengganti %APPDATA%/TetraBooth (mis. laptop pinjaman: semua di folder kerja). */
export const dataDir = flags.value("data");

/**
 * Camera Service: `--no-spawn` = sambung ke service yang dijalankan manual (port 8765, token dev).
 * Diteruskan apa adanya sampai config device ada: --printer, --printer-2x6x2 (antrean potong 2 inci, #52),
 * --paper-4r, --paper-2x6x2, --paper-fit,
 * --print-offset (kalibrasi DNP, M-021), --print-to-file (khusus uji/stress, printer ber-port PORTPROMPT: seperti
 * Print to PDF), --hot-folder (M7), --hot-folder-trigger (pemicu shutter, mis. digiCamControl).
 */
export const cameraServiceFlags = {
  spawn: !flags.has("no-spawn"),
  path: flags.value("camera-service"),
  args: (
    [
      "printer",
      "printer-2x6x2",
      "paper-4r",
      "paper-2x6x2",
      "paper-fit",
      "print-offset",
      "print-to-file",
      "hot-folder",
      "hot-folder-trigger",
    ] as const
  ).flatMap((k) => {
    const v =
      flags.value(k) ?? (k === "hot-folder-trigger" && digicam ? DIGICAM_TRIGGER : undefined);
    return v ? [`--${k}`, v] : [];
  }),
};

/** Antrean printer utama (`--printer`), untuk membuka dialog Printing Preferences dari menu crew. */
export const printerName = flags.value("printer");

/** Interval log metrik (detik), default 60. Stress test memakai nilai kecil. */
export const metricsEverySec = Math.max(2, Number(flags.value("metrics-every") ?? 60) || 60);
