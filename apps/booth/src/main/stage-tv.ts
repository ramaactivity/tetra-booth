import { join } from "node:path";
import { BrowserWindow, type Display, ipcMain, screen } from "electron";

/**
 * Photo Stage S2 (#179, docs/PLAN-PHOTO-STAGE.md §7): jendela TV layar penuh di layar kedua (HDMI, HDMI nirkabel,
 * Miracast "Extend"). Muncul sendiri saat layar eksternal tersambung, tertutup saat dicabut. Keadaan TV dikirim
 * layar operator (`stageTvPublish`) dan diteruskan ke jendela TV; keadaan terakhir disimpan supaya TV yang baru
 * tersambung langsung tampil. `forceWindow` = jendela TV biasa di layar utama (uji di laptop satu layar).
 */
export function startStageTv(o: {
  preload: string;
  forceWindow: boolean;
  log: (m: string) => void;
}) {
  let tv: BrowserWindow | null = null;
  let last: unknown = null;

  const status = () => {
    for (const w of BrowserWindow.getAllWindows())
      if (w !== tv) w.webContents.send("stageTvStatus", !!tv);
  };
  const open = (d: Display | null) => {
    const b = d?.bounds ?? { x: 40, y: 40, width: 960, height: 540 };
    const win = new BrowserWindow({
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      fullscreen: !!d,
      frame: !d,
      // Keyboard tetap di layar operator (Enter/Spasi), TV hanya tampilan.
      focusable: !d,
      autoHideMenuBar: true,
      title: "Tetra Photo Stage · TV",
      backgroundColor: "#F8F7F4",
      webPreferences: {
        preload: o.preload,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    const url = process.env.ELECTRON_RENDERER_URL;
    void (url
      ? win.loadURL(`${url}#tv`)
      : win.loadFile(join(__dirname, "../renderer/index.html"), { hash: "tv" }));
    win.webContents.on("render-process-gone", () =>
      setTimeout(() => !win.isDestroyed() && win.reload(), 300),
    );
    win.on("closed", () => {
      if (tv === win) tv = null;
      status();
    });
    tv = win;
    o.log(
      `[stage-tv] jendela TV dibuka ${d ? `di layar ${d.id} (${b.width}×${b.height})` : "(uji, layar utama)"}`,
    );
    status();
  };
  const external = () => {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().find((d) => d.id !== primary) ?? null;
  };
  const sync = () => {
    const d = external();
    if (o.forceWindow) {
      if (!tv) open(null);
      return;
    }
    if (d && tv && !tv.isDestroyed()) {
      const b = tv.getBounds();
      if (b.x !== d.bounds.x || b.y !== d.bounds.y) {
        tv.close();
        open(d);
      }
    } else if (d && !tv) open(d);
    else if (!d && tv) {
      o.log("[stage-tv] layar TV terputus");
      tv.close();
    }
  };

  ipcMain.handle("stageTvPublish", (_e, state: unknown) => {
    last = state;
    tv?.webContents.send("stageTv", state);
  });
  ipcMain.handle("stageTvLast", () => last);
  ipcMain.handle("stageTvStatus", () => !!tv);
  screen.on("display-added", sync);
  screen.on("display-removed", sync);
  screen.on("display-metrics-changed", sync);
  sync();
  return { last: () => last };
}
