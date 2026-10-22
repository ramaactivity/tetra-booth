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

/** Ctrl+Shift+H (Cmd di Mac): crew menyembunyikan booth ke taskbar, mis. untuk membuka admin di browser. */
export const isMinimizeShortcut = (
  i: Pick<Input, "type" | "key" | "control" | "meta" | "shift">,
): boolean =>
  i.type === "keyDown" && (i.control || i.meta) && i.shift && i.key.toLowerCase() === "h";

/**
 * Kiosk + selalu di atas: taskbar/aplikasi lain tidak bisa muncul di atas booth saat fokus pindah
 * (uji Windows 2026-09-30). Dilepas bersama kiosk untuk dialog printer / dashboard admin.
 */
export function setKioskOn(win: BrowserWindow, on: boolean) {
  win.setKiosk(on);
  win.setAlwaysOnTop(on, "screen-saver");
}

/** Kecilkan booth ke taskbar; kiosk dilepas dan dipasang lagi saat jendela difokus (ikon taskbar diklik). */
export function minimizeBooth(win: BrowserWindow) {
  if (win.isKiosk()) {
    setKioskOn(win, false);
    win.once("focus", () => {
      if (!win.isDestroyed()) setKioskOn(win, true);
    });
  }
  win.minimize();
}

export function applyKiosk(win: BrowserWindow, log: (m: string) => void) {
  setKioskOn(win, true);
  win.setMenu(null);
  win.webContents.on("before-input-event", (e, input) => {
    if (isBlockedShortcut(input)) e.preventDefault();
    else if (isMinimizeShortcut(input)) {
      e.preventDefault();
      minimizeBooth(win);
      log("[kiosk] booth dikecilkan ke taskbar (Ctrl+Shift+H)");
    }
  });
  win.on("close", (e) => {
    if (!quitAllowed) {
      e.preventDefault();
      log("[kiosk] tutup ditolak: keluar hanya dari mode crew");
    }
  });
  const blocker = powerSaveBlocker.start("prevent-display-sleep");
  app.on("will-quit", () => powerSaveBlocker.stop(blocker));
  log("[kiosk] aktif: layar penuh, selalu di atas, anti-sleep, keluar hanya dari mode crew");
}

/** Auto-start = booth menyala sendiri (mis. setelah listrik mati) → lewati layar awal, lanjut event terakhir. */
const LOGIN_ARGS = ["--resume"];

/** Auto-start saat login Windows (HKCU Run). Hanya app hasil build; di dev menunjuk electron.exe. */
export function autoStart(): { enabled: boolean; supported: boolean } {
  const supported = app.isPackaged && process.platform !== "linux";
  return {
    enabled: supported && app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin,
    supported,
  };
}

/** Nama entri auto-start (HKCU Run) dan identitas app di Windows = appId build, bukan "electron.app.Electron" (M-011). */
export const APP_ID = "id.tetraphoto.booth";

export function setAutoStart(on: boolean) {
  if (!autoStart().supported) throw new Error("auto-start hanya untuk app hasil build");
  app.setLoginItemSettings({ openAtLogin: on, args: LOGIN_ARGS });
}
