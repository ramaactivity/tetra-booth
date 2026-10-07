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
  "canon",
  "sony",
  /** Peran laptop (#178): `--role stage` = Photo Stage. */
  "role",
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
  camera: z.enum(["webcam", "simulated", "hotfolder", "canon", "sony"]).optional(),
  webcamId: z.string().max(512).optional(),
  mirrorLiveView: z.boolean().optional(),
  mirrorPhoto: z.boolean().optional(),
  afBeforeCapture: z.boolean().optional(),
  hotFolder: z.string().min(1).max(260).optional(),
  hotFolderTrigger: z.url().max(512).optional(),
  printer: z.string().min(1).max(256).optional(),
  /** Peran laptop (#178): `stage` = Photo Stage. Bawaan booth. */
  role: z.enum(["booth", "stage"]).optional(),
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
  role: device.role,
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
/**
 * digiCamControl dihapus (DECISIONS #141, #168). Migrasi booth lama: `--digicam`, atau hot folder yang dipicu web
 * server digiCamControl (port 5513, dulu mode crew "DSLR (digiCamControl)") → Canon EDSDK; folder & pemicunya diabaikan.
 */
export const isLegacyDigicam = (f: Pick<ReturnType<typeof parseFlags>, "has" | "value">) =>
  f.has("digicam") ||
  (f.value("camera") === "hotfolder" && /:5513([/?]|$)/.test(f.value("hot-folder-trigger") ?? ""));
const legacyDigicam = isLegacyDigicam(flags);

/** Dicatat di index setelah log file aktif. */
export const flagWarnings = [
  ...(fileArgs.length ? [`[config] flag dari ${flagsFile}: ${fileArgs.join(" ")}`] : []),
  ...(deviceArgs.length ? [`[config] mode crew (${deviceFile}): ${deviceArgs.join(" ")}`] : []),
  ...flags.missing.map((m) => `[config] --${m} butuh nilai, diabaikan`),
  ...(legacyDigicam
    ? ["[config] digiCamControl sudah dihapus (#168): kamera pindah ke Canon EDSDK"]
    : []),
];

/** Tanda "booth membuka ulang sendiri" di kv: layar awal dilewati sekali (DECISIONS #86). */
export const RESUME_KEY = "resume_once";
/** Catatan "update ke versi X" sebelum installer jalan; dibaca sekali saat booth terbuka lagi. */
export const UPDATE_PENDING_KEY = "update_pending";
/**
 * Layar awal pilih mode & event: app hasil build yang dibuka manual. Dilewati kalau booth membuka ulang sendiri
 * (`resume`), `--resume` (auto-start login), atau demo; `--start-screen` memaksa (uji).
 */
export const startScreenFlag = (isPackaged: boolean, resume: boolean) =>
  flags.has("start-screen") ||
  (isPackaged && !resume && !flags.has("resume") && !flags.has("demo"));

/** Kiosk (M5): default aktif di app hasil build; `--kiosk` / `--no-kiosk` memaksa. */
/** Bumper video saat event dibuka (#105): booth terpasang; `--bumper` memaksa (uji), `--no-bumper` mematikan. */
export const bumperFlag = (isPackaged: boolean) =>
  flags.has("bumper") || (isPackaged && !flags.has("no-bumper") && !flags.has("demo"));

export const kioskFlag = (isPackaged: boolean) =>
  flags.has("kiosk") || (isPackaged && !flags.has("no-kiosk"));

/** Booth terpasang (installer) di Windows tanpa pilihan kamera: bawaan Canon EDSDK, bukan webcam. */
const packagedWindows = process.platform === "win32" && !process.defaultApp;

/**
 * `--camera=canon`: DSLR Canon lewat EDSDK di Camera Service (DECISIONS #111). DLL Canon tidak ikut installer
 * (lisensi) dan diunduh otomatis ke `<folder data>/edsdk` (#112), atau `--canon <folder>`;
 * `--canon fake` = kamera simulasi (dev/e2e).
 */
export const canon =
  flags.value("camera") === "canon" || legacyDigicam || (packagedWindows && !flags.value("camera"))
    ? (flags.value("canon") ?? join(userDir, "edsdk"))
    : undefined;

/**
 * `--camera=sony`: mirrorless Sony lewat Camera Remote Command (PTP) di Camera Service (DECISIONS #169, #171). Driver
 * MTP bawaan Windows (`--sony wpd`, bawaan); `--sony fake` (A7 III) / `--sony fake-v3` (A7 IV) = kamera simulasi
 * (dev/e2e). Jepret, live view, setelan, & fokus seperti Canon; belum diuji dengan kamera asli (W-037…W-041).
 */
export const sony = flags.value("camera") === "sony" ? (flags.value("sony") ?? "wpd") : undefined;

export const config: BoothConfig = {
  camera: canon
    ? "canon"
    : sony
      ? "sony"
      : ((["simulated", "hotfolder"] as const).find((c) => c === flags.value("camera")) ??
        "webcam"),
  liveView: !!canon || !!sony,
  demo: flags.has("demo"),
  fast: flags.has("fast"),
  guestUrl: process.env.TETRA_GUEST_URL ?? "https://booth.tetraphoto.com",
  ...(device.webcamId ? { webcamId: device.webcamId } : {}),
  mirrorLiveView: device.mirrorLiveView ?? true,
  mirrorPhoto: device.mirrorPhoto ?? false,
  ...(flags.value("role") === "stage" ? { role: "stage" as const } : {}),
};

const size = /^(\d+)x(\d+)$/.exec(flags.value("size") ?? "");
export const windowSize = size
  ? { width: Number(size[1]), height: Number(size[2]) }
  : { width: 1280, height: 720 };

/** Folder screenshot per fase (uji jarak jauh tanpa melihat layar). */
export const shotsDir = flags.value("shots");

/** Photo Stage (#179): `--tv-window` = jendela TV biasa di layar utama (uji tanpa layar kedua). */
export const stageTvWindow = flags.has("tv-window");

/**
 * Camera Service: `--no-spawn` = sambung ke service yang dijalankan manual (port 8765, token dev).
 * Diteruskan apa adanya sampai config device ada: --printer, --printer-2x6x2 (antrean potong 2 inci, #52),
 * --paper-4r, --paper-2x6x2, --paper-fit,
 * --print-offset (kalibrasi DNP, M-021), --print-to-file (khusus uji/stress, printer ber-port PORTPROMPT: seperti
 * Print to PDF). Khusus `--camera=hotfolder` (teknisi, #168): --hot-folder (M7), --hot-folder-trigger (URL pemicu
 * shutter, GET per jepret).
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
      ...(config.camera === "hotfolder" ? (["hot-folder", "hot-folder-trigger"] as const) : []),
    ] as const
  ).flatMap((k) => {
    const v = flags.value(k);
    return v ? [`--${k}`, v] : [];
  }),
};
if (canon) cameraServiceFlags.args.push("--canon", canon);
if (sony) cameraServiceFlags.args.push("--sony", sony);

/** Antrean printer utama (`--printer`), untuk membuka dialog Printing Preferences dari menu crew. */
export const printerName = flags.value("printer");

/** Nilai yang sedang dipakai (untuk sheet Kamera & Printer di mode crew). */
export const deviceNow: DeviceSettings = {
  camera: config.camera,
  ...(device.webcamId ? { webcamId: device.webcamId } : {}),
  mirrorLiveView: config.mirrorLiveView ?? true,
  mirrorPhoto: config.mirrorPhoto ?? false,
  afBeforeCapture: !!device.afBeforeCapture,
  ...(config.camera === "hotfolder" && flags.value("hot-folder")
    ? { hotFolder: flags.value("hot-folder") }
    : {}),
  ...(config.camera === "hotfolder" && flags.value("hot-folder-trigger")
    ? { hotFolderTrigger: flags.value("hot-folder-trigger") }
    : {}),
  ...(printerName ? { printer: printerName } : {}),
  role: config.role ?? "booth",
};

/** Interval log metrik (detik), default 60. Stress test memakai nilai kecil. */
export const metricsEverySec = Math.max(2, Number(flags.value("metrics-every") ?? 60) || 60);
