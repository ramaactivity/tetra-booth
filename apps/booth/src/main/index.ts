import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { startCameraService } from "./camera-service";
import { cameraServiceFlags, dataDir, windowSize } from "./config";
import { openDb } from "./db";
import { registerIpc } from "./ipc";
import { setupLogging } from "./log";

// Data lokal di %APPDATA%/TetraBooth (TSD §3), bukan nama produk dengan spasi.
app.setPath("userData", dataDir ?? join(app.getPath("appData"), "TetraBooth"));

const logToFile = setupLogging(join(app.getPath("userData"), "logs"));
const db = openDb(join(app.getPath("userData"), "db.sqlite"));
console.info(
  `[boot] Tetra Booth ${app.getVersion()} · data ${app.getPath("userData")} · sesi terputus ditandai: ${db.abandoned}`,
);

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
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(__dirname, "../renderer/index.html"));
};

registerIpc(db);
app.on("will-quit", () => db.close());
app.whenReady().then(async () => {
  if (cameraServiceFlags.spawn) await startCameraService((m) => console.info(m));
  createWindow();
});
app.on("window-all-closed", () => app.quit());
