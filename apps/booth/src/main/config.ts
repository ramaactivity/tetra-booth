import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BoothConfig } from "@tetra/platform-electron";
import { z } from "zod";

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

/** Isi file flag jadi argumen: baris `#` = komentar, nilai berspasi pakai tanda kutip. */
export const splitArgs = (text: string) =>
  text
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("#"))
    .flatMap((l) => [...l.matchAll(/"([^"]*)"|(\S+)/g)].map((m) => m[1] ?? m[2] ?? ""));

/** Folder data booth: `--data`, atau %APPDATA%/TetraBooth (TSD §3; index.ts memakai folder yang sama). */
const argvFlags = parseFlags(process.argv);
export const dataDir = argvFlags.value("data");
const appData =
  process.env.APPDATA ??
  (process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support")
    : join(homedir(), ".config"));
export const userDir = dataDir ?? join(appData, "TetraBooth");

/** Pengaturan perangkat dari mode crew (DECISIONS #85), satu file per laptop. */
export const DeviceSettings = z.object({
  camera: z.enum(["webcam", "simulated", "hotfolder"]).optional(),
  webcamId: z.string().max(512).optional(),
  hotFolder: z.string().min(1).max(260).optional(),
  hotFolderTrigger: z.url().max(512).optional(),
  printer: z.string().min(1).max(256).optional(),
});
export type DeviceSettings = z.infer<typeof DeviceSettings>;
export const deviceFile = join(userDir, "device.json");
const readText = (f: string) => {
  try {
    return readFileSync(f, "utf8");
  } catch {
    return null;
  }
};
export const device: DeviceSettings = (() => {
  const r = DeviceSettings.safeParse(JSON.parse(readText(deviceFile) ?? "{}"));
  return r.success ? r.data : {};
})();
const deviceArgs = Object.entries({
  camera: device.camera,
  "hot-folder": device.hotFolder,
  "hot-folder-trigger": device.hotFolderTrigger,
  printer: device.printer,
}).flatMap(([k, v]) => (v ? [`--${k}`, v] : []));

/**
 * Flag tetap per laptop (DECISIONS #83): shortcut installer tidak membawa argumen, jadi flag bisa ditulis di
 * `<folder data>/booth-flags.txt` (juga dibaca dari `%APPDATA%/Tetra Booth/` lama).
 * Prioritas: file flag < pengaturan mode crew (device.json) < argumen baris perintah.
 */
const flagsFile = [
  join(userDir, "booth-flags.txt"),
  ...(dataDir ? [] : [join(appData, "Tetra Booth", "booth-flags.txt")]),
].find((f) => readText(f) !== null);
const fileArgs = flagsFile ? splitArgs(readText(flagsFile) ?? "") : [];

/** Flag yang dipaksa baris perintah: tidak bisa diubah dari mode crew. */
export const lockedByArgv = (name: string) => argvFlags.has(name);

/**
 * Flag baris perintah (uji & dev). Contoh:
 *   electron apps/booth --camera=simulated --demo --size 1080x1920 --printer "Microsoft Print to PDF" --data C:/tmp/data
 */
const flags = parseFlags([...fileArgs, ...deviceArgs, ...process.argv]);
/** Dicatat di index setelah log file aktif. */
export const flagWarnings = [
  ...(fileArgs.length ? [`[config] flag dari ${flagsFile}: ${fileArgs.join(" ")}`] : []),
  ...(deviceArgs.length ? [`[config] mode crew (${deviceFile}): ${deviceArgs.join(" ")}`] : []),
  ...flags.missing.map((m) => `[config] --${m} butuh nilai, diabaikan`),
];

/** Tanda "booth membuka ulang sendiri" di kv: layar awal dilewati sekali (DECISIONS #86). */
export const RESUME_KEY = "resume_once";
/**
 * Layar awal pilih mode & event: app hasil build yang dibuka manual. Dilewati kalau booth membuka ulang sendiri
 * (`resume`), `--resume` (auto-start login), atau demo; `--start-screen` memaksa (uji).
 */
export const startScreenFlag = (isPackaged: boolean, resume: boolean) =>
  flags.has("start-screen") ||
  (isPackaged && !resume && !flags.has("resume") && !flags.has("demo"));

/** Kiosk (M5): default aktif di app hasil build; `--kiosk` / `--no-kiosk` memaksa. */
export const kioskFlag = (isPackaged: boolean) =>
  flags.has("kiosk") || (isPackaged && !flags.has("no-kiosk"));

export const config: BoothConfig = {
  camera:
    (["simulated", "hotfolder"] as const).find((c) => c === flags.value("camera")) ?? "webcam",
  demo: flags.has("demo"),
  fast: flags.has("fast"),
  guestUrl: process.env.TETRA_GUEST_URL ?? "https://booth.tetraphoto.com",
  ...(device.webcamId ? { webcamId: device.webcamId } : {}),
};

const size = /^(\d+)x(\d+)$/.exec(flags.value("size") ?? "");
export const windowSize = size
  ? { width: Number(size[1]), height: Number(size[2]) }
  : { width: 1280, height: 720 };

/** Folder screenshot per fase (uji jarak jauh tanpa melihat layar). */
export const shotsDir = flags.value("shots");

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
    const v = flags.value(k);
    return v ? [`--${k}`, v] : [];
  }),
};

/** Antrean printer utama (`--printer`), untuk membuka dialog Printing Preferences dari menu crew. */
export const printerName = flags.value("printer");

/** Nilai yang sedang dipakai (untuk sheet Kamera & Printer di mode crew). */
export const deviceNow: DeviceSettings = {
  camera: config.camera,
  ...(device.webcamId ? { webcamId: device.webcamId } : {}),
  ...(flags.value("hot-folder") ? { hotFolder: flags.value("hot-folder") } : {}),
  ...(flags.value("hot-folder-trigger")
    ? { hotFolderTrigger: flags.value("hot-folder-trigger") }
    : {}),
  ...(printerName ? { printer: printerName } : {}),
};

/** Interval log metrik (detik), default 60. Stress test memakai nilai kecil. */
export const metricsEverySec = Math.max(2, Number(flags.value("metrics-every") ?? 60) || 60);
