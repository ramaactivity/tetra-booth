import { existsSync } from "node:fs";
import { join } from "node:path";
import { init as sentryInit } from "@sentry/electron/main";
import { EDSDK_FILES } from "@tetra/shared";
import { app, BrowserWindow } from "electron";
import { createAlerts } from "./alerts";
import { startCameraService, watchPrintEvents } from "./camera-service";
import { createCloud } from "./cloud";
import {
  bumperFlag,
  cameraServiceFlags,
  canon,
  config,
  flagWarnings,
  kioskFlag,
  metricsEverySec,
  RESUME_KEY,
  stageTvWindow,
  startScreenFlag,
  userDir,
  windowSize,
} from "./config";
import { openDb } from "./db";
import { ensureEdsdk, releaseCameraForEdsdk } from "./edsdk";
import { createFrameWatch } from "./frame-watch";
import { createGpuWatch } from "./gpu-watch";
import { registerIpc } from "./ipc";
import { APP_ID, allowQuit, applyKiosk } from "./kiosk";
import { setupLogging } from "./log";
import { startMetrics } from "./metrics";
import { startStageLan } from "./stage-lan";
import { startStageTv } from "./stage-tv";

// Sentry hanya di build terpasang (dev & e2e tidak mengirim). Event antre di disk saat offline, tidak pernah menunggu jaringan.
if (app.isPackaged)
  sentryInit({
    dsn: "https://7ab8a1a1fcc2015dd5bd4b7b6b117907@o4512143875309568.ingest.us.sentry.io/4512143898050560",
    includeServerName: false,
    tracesSampleRate: 0,
    // Tanpa data pribadi tamu: SDK v11 default-nya mengumpulkan semua.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      stackFrameVariables: false,
    },
  });

if (process.platform === "win32") app.setAppUserModelId(APP_ID);

// Data lokal di %APPDATA%/TetraBooth (TSD §3), bukan nama produk dengan spasi.
app.setPath("userData", userDir);
// Bumper (#105) diputar dengan suaranya saat booth dibuka, sebelum ada sentuhan tamu.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const logToFile = setupLogging(join(app.getPath("userData"), "logs"));
for (const w of flagWarnings) console.warn(w);
const db = openDb(join(app.getPath("userData"), "db.sqlite"));
console.info(
  `[boot] Tetra Booth ${app.getVersion()} · data ${app.getPath("userData")} · sesi terputus ditandai: ${db.abandoned}`,
);

// Dibuka ulang oleh booth sendiri (update, setelan, pemulihan GPU) → langsung ke event terakhir.
const resumed = db.kv.get(RESUME_KEY) === "1";
db.kv.set(RESUME_KEY, "0");
config.startScreen = startScreenFlag(app.isPackaged, resumed);
config.bumper = bumperFlag(app.isPackaged);

const alerts = createAlerts(db);
// Boot ulang booth: lewat before-quit (print ditunggu), juga di kiosk. Kalau quit tersangkut (jendela beku), paksa.
const relaunch = () => {
  db.kv.set(RESUME_KEY, "1");
  allowQuit();
  app.relaunch({ args: process.argv.slice(1) });
  app.quit();
  setTimeout(() => app.exit(0), 30_000).unref();
};
// Pemulihan GPU (M-016, M-017): relaunch saat kembali ke attract.
const gpu = createGpuWatch({ log: (m) => console.warn(m), relaunch });
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
  // Layar beku tanpa event GPU (M-018) → relaunch langsung; sesi yang beku memang sudah tidak bisa dilanjutkan.
  const frames = createFrameWatch({
    probe: () =>
      win.webContents.executeJavaScript("new Promise((r) => requestAnimationFrame(() => r(0)))"),
    active: () =>
      !win.isDestroyed() && win.isVisible() && !win.isMinimized() && !win.webContents.isLoading(),
    frozen: () => {
      console.error("[watchdog] layar tidak menggambar > 15 s, relaunch booth");
      relaunch();
    },
  });
  const timer = setInterval(() => frames.tick(), 5000);
  win.on("closed", () => clearInterval(timer));
  void load();
};

// Cloud (Fase 2): server = app web yang sama dengan halaman tamu.
const cloud = createCloud(db, alerts, config.guestUrl, (m) => console.info(m));
// Pairing baru di laptop Canon yang belum punya DLL (booth dicabut lalu dipasangkan ulang, laporan 7 Okt):
// unduh DLL lalu buka ulang booth supaya Camera Service memuatnya, tanpa crew menutup aplikasi manual.
const onPaired = () => {
  const dir = canon;
  if (!dir || dir === "fake" || EDSDK_FILES.every((f) => existsSync(join(dir, f)))) return;
  const log = (m: string) => console.info(m);
  void ensureEdsdk(dir, () => cloud.edsdk(), log).then((ok) => {
    if (!ok) return;
    log("[edsdk] DLL Canon siap setelah pairing, booth dibuka ulang");
    relaunch();
  });
};
registerIpc(db, alerts, cloud, (p) => gpu.phase(p), onPaired);
app.on("will-quit", () => db.close());
app.whenReady().then(async () => {
  const log = (m: string) => console.info(m);
  // Canon EDSDK (#112): DLL diunduh sendiri dari cloud kalau belum ada (bukan untuk `--canon fake`).
  if (canon && canon !== "fake") {
    await releaseCameraForEdsdk(log);
    await ensureEdsdk(canon, () => cloud.edsdk(), log);
  }
  if (cameraServiceFlags.spawn) await startCameraService(log, db, alerts);
  else app.on("will-quit", watchPrintEvents(log, db, alerts));
  createWindow();
  if (config.role === "stage") {
    const tv = startStageTv({
      preload: join(__dirname, "../preload/index.js"),
      forceWindow: stageTvWindow,
      log,
    });
    // Layar di device kedua lewat WiFi tanpa internet (#205).
    startStageLan({
      rendererDir: join(__dirname, "../renderer"),
      sessionsRoot: () => join(app.getPath("userData"), "sessions"),
      state: tv.last,
      log,
    });
  }
  cloud.start();
  startMetrics(db, metricsEverySec, log);
});
app.on("window-all-closed", () => app.quit());
