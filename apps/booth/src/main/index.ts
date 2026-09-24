import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { createAlerts } from "./alerts";
import { startCameraService, watchPrintEvents } from "./camera-service";
import {
  cameraServiceFlags,
  config,
  dataDir,
  flagWarnings,
  kioskFlag,
  metricsEverySec,
  windowSize,
} from "./config";
import { openDb } from "./db";
import { createGpuWatch } from "./gpu-watch";
import { registerIpc } from "./ipc";
import { APP_ID, applyKiosk } from "./kiosk";
import { setupLogging } from "./log";
import { startMetrics } from "./metrics";

if (process.platform === "win32") app.setAppUserModelId(APP_ID);

// Data lokal di %APPDATA%/TetraBooth (TSD §3), bukan nama produk dengan spasi.
app.setPath("userData", dataDir ?? join(app.getPath("appData"), "TetraBooth"));

const logToFile = setupLogging(join(app.getPath("userData"), "logs"));
for (const w of flagWarnings) console.warn(w);
const db = openDb(join(app.getPath("userData"), "db.sqlite"));
console.info(
  `[boot] Tetra Booth ${app.getVersion()} · data ${app.getPath("userData")} · sesi terputus ditandai: ${db.abandoned}`,
);

const alerts = createAlerts(db);
// Pemulihan GPU (M-016, M-017): relaunch (lewat before-quit yang menunggu print) saat kembali ke attract.
const gpu = createGpuWatch({
  log: (m) => console.warn(m),
  relaunch: () => {
    app.relaunch({ args: process.argv.slice(1) });
    app.quit();
  },
});
app.on("child-process-gone", (_e, d) => {
  if (d.type === "GPU") gpu.gpuGone(d.reason);
});
const kiosk = kioskFlag(app.isPackaged);
config.kiosk = kiosk;

const LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"];

const createWindow = () => {
  const win = new BrowserWindow({
    ...windowSize,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Booth tidak boleh melambat walau jendela tertutup jendela lain (timer sesi, live view, screenshot uji).
      backgroundThrottling: false,
    },
  });
  // Log renderer ikut ke file harian.
  win.webContents.on("console-message", (e) =>
    logToFile(
      `R-${LEVELS[["debug", "info", "warning", "error"].indexOf(e.level)] ?? "INFO"}`,
      e.message,
    ),
  );
  const load = () =>
    process.env.ELECTRON_RENDERER_URL
      ? win.loadURL(process.env.ELECTRON_RENDERER_URL)
      : win.loadFile(join(__dirname, "../renderer/index.html"));
  // Layar crash → muat ulang (booth tidak boleh berhenti di layar putih). Ditunda sebentar dan lewat
  // loadFile, bukan reload() langsung di event, supaya preload tidak gagal di proses yang masih mati (M-011).
  win.webContents.on("render-process-gone", (_e, d) => {
    console.error(`[window] renderer mati (${d.reason}), muat ulang`);
    setTimeout(
      () =>
        void load().catch((e: unknown) =>
          console.error(`[window] gagal memuat ulang: ${String(e)}`),
        ),
      300,
    );
  });
  if (kiosk) applyKiosk(win, (m) => console.info(m));
  void load();
};

registerIpc(db, alerts, (p) => gpu.phase(p));
app.on("will-quit", () => db.close());
app.whenReady().then(async () => {
  const log = (m: string) => console.info(m);
  if (cameraServiceFlags.spawn) await startCameraService(log, db, alerts);
  else app.on("will-quit", watchPrintEvents(log, db, alerts));
  createWindow();
  startMetrics(db, metricsEverySec, log);
});
app.on("window-all-closed", () => app.quit());
