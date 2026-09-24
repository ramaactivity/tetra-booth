import { app, type BrowserWindow, type Input, powerSaveBlocker } from "electron";

/**
 * Mode kiosk (FSD §1.1, M5): layar penuh, anti-sleep, tidak bisa ditutup kecuali lewat mode crew.
 * Tidak mengubah setelan Windows; auto-start hanya lewat toggle crew (`setAutoStart`).
 */

let quitAllowed = false;
/** Hanya mode crew yang boleh menutup booth saat kiosk. */
export const allowQuit = () => {
  quitAllowed = true;
};

/** Shortcut yang diblokir di kiosk: reload, devtools, fullscreen, tutup tab/jendela, zoom. */
export function isBlockedShortcut(
  i: Pick<Input, "type" | "key" | "control" | "meta" | "alt" | "shift">,
): boolean {
  if (i.type !== "keyDown") return false;
  const k = i.key.toLowerCase();
  const mod = i.control || i.meta;
  if (["f5", "f11", "f12"].includes(k)) return true;
  if (i.alt && k === "f4") return true;
  if (mod && ["r", "w", "q", "+", "-", "=", "0"].includes(k)) return true;
  if (mod && i.shift && ["i", "j", "c"].includes(k)) return true;
  return false;
}

export function applyKiosk(win: BrowserWindow, log: (m: string) => void) {
  win.setKiosk(true);
  win.setMenu(null);
  win.webContents.on("before-input-event", (e, input) => {
    if (isBlockedShortcut(input)) e.preventDefault();
  });
  win.on("close", (e) => {
    if (!quitAllowed) {
      e.preventDefault();
      log("[kiosk] tutup ditolak: keluar hanya dari mode crew");
    }
  });
  const blocker = powerSaveBlocker.start("prevent-display-sleep");
  app.on("will-quit", () => powerSaveBlocker.stop(blocker));
  log("[kiosk] aktif: layar penuh, anti-sleep, keluar hanya dari mode crew");
}

/** Auto-start saat login Windows (HKCU Run). Hanya app hasil build; di dev menunjuk electron.exe. */
export function autoStart(): { enabled: boolean; supported: boolean } {
  const supported = app.isPackaged && process.platform !== "linux";
  return { enabled: supported && app.getLoginItemSettings().openAtLogin, supported };
}

export function setAutoStart(on: boolean) {
  if (!autoStart().supported) throw new Error("auto-start hanya untuk app hasil build");
  app.setLoginItemSettings({ openAtLogin: on });
}
