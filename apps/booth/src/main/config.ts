import type { BoothConfig } from "@tetra/platform-electron";

/**
 * Flag baris perintah (uji & dev). Contoh:
 *   electron out/main/index.js --camera=simulated --demo --size=1080x1920 --shots=C:/tmp/shots --data=C:/tmp/data
 */
const flag = (name: string): string | undefined => {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
};

export const config: BoothConfig = {
  camera: flag("camera") === "simulated" ? "simulated" : "webcam",
  demo: flag("demo") !== undefined,
  guestUrl: process.env.TETRA_GUEST_URL ?? "https://app.tetraphoto.com",
};

const size = /^(\d+)x(\d+)$/.exec(flag("size") ?? "");
export const windowSize = size
  ? { width: Number(size[1]), height: Number(size[2]) }
  : { width: 1280, height: 720 };

/** Folder screenshot per fase (uji jarak jauh tanpa melihat layar). */
export const shotsDir = flag("shots") || undefined;

/** Folder data lokal pengganti %APPDATA%/TetraBooth (mis. laptop pinjaman: semua di folder kerja). */
export const dataDir = flag("data") || undefined;

/**
 * Camera Service: `--no-spawn` = sambung ke service yang dijalankan manual (port 8765, token dev).
 * Printer diteruskan apa adanya sampai config device ada (M6): --printer, --paper-4r, --paper-2x6x2,
 * --print-to-file (khusus uji/stress, printer ber-port PORTPROMPT: seperti Print to PDF).
 */
export const cameraServiceFlags = {
  spawn: flag("no-spawn") === undefined,
  path: flag("camera-service") || undefined,
  printerArgs: ["printer", "paper-4r", "paper-2x6x2", "print-to-file"].flatMap((k) => {
    const v = flag(k);
    return v ? [`--${k}`, v] : [];
  }),
};
