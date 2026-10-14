import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { init as sentryInit } from "@sentry/electron/main";
import { SDK_FILES, type SdkKit } from "@tetra/shared";
import { app, BrowserWindow, ipcMain } from "electron";
import { z } from "zod";
import { createAlerts } from "./alerts";
import { startCameraService, watchPrintEvents } from "./camera-service";
import { createCloud } from "./cloud";
import {
  bumperFlag,
  cameraServiceFlags,
  canon,
  config,
  type DeviceSettings,
  device,
  deviceFile,
  deviceNow,
  flagWarnings,
  kioskFlag,
  lumix,
  metricsEverySec,
  nikon,
  printShare,
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
import { checkHub, findHubs, setupPrintShare } from "./print-share";
import { findStages, pingStage, startStageLan } from "./stage-lan";
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
// DLL kamera dari cloud (#112): Canon EDSDK, Lumix (#214), atau Nikon klasik + Z v2 (#216); bukan untuk `fake`.
const sdks: { dir: string; kit: SdkKit; brand: string }[] =
  canon && canon !== "fake"
    ? [{ dir: canon, kit: "edsdk", brand: "Canon" }]
    : lumix && lumix !== "fake"
      ? [{ dir: lumix, kit: "lumix", brand: "Lumix" }]
      : nikon && nikon !== "fake"
        ? [
            { dir: nikon, kit: "nikon", brand: "Nikon" },
            { dir: join(nikon, "z"), kit: "nikonz", brand: "Nikon Z" },
          ]
        : [];
const ensureSdks = (list: typeof sdks, log: (m: string) => void) =>
  Promise.all(
    list.map((s) => ensureEdsdk(s.dir, () => cloud.edsdk(s.kit), log, SDK_FILES[s.kit], s.brand)),
  );
const onPaired = () => {
  const missing = sdks.filter((s) => !SDK_FILES[s.kit].every((f) => existsSync(join(s.dir, f))));
  if (!missing.length) return;
  const log = (m: string) => console.info(m);
  void ensureSdks(missing, log).then((ok) => {
    if (!ok.some(Boolean)) return;
    log(
      `[edsdk] DLL ${missing.map((s) => s.brand).join(" + ")} siap setelah pairing, booth dibuka ulang`,
    );
    relaunch();
  });
};
const { sendPrint, crewOnly } = registerIpc(db, alerts, cloud, (p) => gpu.phase(p), onPaired);
// Printer bersama lewat WiFi (#261): laptop printer menerima cetakan booth lain, atau booth ini mengirim ke sana.
const boothName = () => cloud.device()?.name ?? hostname();
const share = setupPrintShare({
  mode: printShare,
  hub: device.printHub,
  db,
  alerts,
  name: boothName,
  inbox: join(app.getPath("userData"), "sessions", "lan-prints"),
  sendPrint,
  log: (m) => console.info(m),
});
ipcMain.handle("crewPrintShare", () => {
  crewOnly();
  return share.info();
});
ipcMain.handle("crewFindHubs", () => {
  crewOnly();
  return findHubs();
});
ipcMain.handle("crewCheckHub", async (_e, url: unknown, key: unknown) => {
  crewOnly();
  const u = z.url().max(200).parse(url);
  const st = await checkHub(
    u,
    z
      .string()
      .regex(/^\d{4}$/)
      .parse(key),
    boothName(),
  );
  return st === "badkey" || st === null
    ? st
    : { id: st.id, name: st.name, printer: st.printer, paper: st.paper };
});
const Tone = z
  .object({
    brightness: z.number(),
    contrast: z.number(),
    saturation: z.number(),
    sharpness: z.number(),
  })
  .nullable();
ipcMain.handle("printShareTone", (_e, local: unknown) => share.tone(Tone.parse(local)));
// Layar galeri (#281): laptop ini menampilkan galeri tamu laptop Photo Stage lewat WiFi (tanpa kamera & printer).
if (config.role === "display") {
  type Target = NonNullable<DeviceSettings["stageTarget"]>;
  const save = async (t: Target | null) => {
    if (t) device.stageTarget = deviceNow.stageTarget = t;
    else {
      delete device.stageTarget;
      delete deviceNow.stageTarget;
    }
    await mkdir(dirname(deviceFile), { recursive: true });
    await writeFile(deviceFile, JSON.stringify(device, null, 2));
  };
  /** Laptop stage masih menjawab dengan id yang sama? Kalau tidak, cari ulang lewat id (IP bisa berubah). */
  const check = async (t: Target) => {
    const ok = (r: Awaited<ReturnType<typeof pingStage>>) =>
      r === "badkey" ? r : r?.id === t.id ? r : null;
    const r = ok(await pingStage(t.url, t.key));
    if (r !== null) return r;
    const f = (await findStages()).find((x) => x.id === t.id);
    if (!f || f.url === t.url) return null;
    const again = ok(await pingStage(f.url, t.key));
    // Kode salah di alamat baru tetap laptop yang sama: alamat disimpan, halaman Hubungkan tinggal minta kode.
    if (again !== null) {
      console.info(`[display] ${t.name} pindah alamat: ${t.url} → ${f.url}`);
      await save({ ...t, url: f.url });
    }
    return again;
  };
  ipcMain.handle("displayFind", () => findStages());
  ipcMain.handle("displayConnect", async (_e, url: unknown, key: unknown) => {
    const u = z.url().max(200).parse(url);
    const k = z
      .string()
      .regex(/^\d{4}$/)
      .parse(key);
    const r = await pingStage(u, k);
    if (r && r !== "badkey") {
      await save({ id: r.id, name: r.name, key: k, url: u });
      console.info(`[display] terhubung ke ${r.name} (${u})`);
    }
    return r === "badkey" || r === null ? r : { id: r.id, name: r.name, key: k, url: u };
  });
  ipcMain.handle("displayCheck", async () => {
    const t = device.stageTarget;
    if (!t) return null;
    const r = await check(t);
    return {
      target: device.stageTarget ?? t,
      state: r === "badkey" ? "badkey" : r ? "ok" : "unreachable",
    };
  });
  ipcMain.handle("displayForget", async () => {
    crewOnly();
    await save(null);
  });
}
app.on("will-quit", () => {
  // Renderer masih mem-poll crewStatus saat quit → "database is not open" di log tiap tutup (audit B04, #251).
  ipcMain.removeHandler("crewStatus");
  db.close();
});
app.whenReady().then(async () => {
  const log = (m: string) => console.info(m);
  // Layar galeri (#281) tidak memotret & tidak mencetak: tanpa DLL kamera & Camera Service.
  if (config.role !== "display") {
    // Canon EDSDK (#112), Lumix (#214), Nikon (#216): DLL diunduh sendiri dari cloud kalau belum ada.
    if (canon && canon !== "fake") await releaseCameraForEdsdk(log);
    await ensureSdks(sdks, log);
    if (cameraServiceFlags.spawn) await startCameraService(log, db, alerts);
    else app.on("will-quit", watchPrintEvents(log, db, alerts));
  }
  createWindow();
  if (config.role === "stage") {
    const tv = startStageTv({
      preload: join(__dirname, "../preload/index.js"),
      forceWindow: stageTvWindow,
      log,
    });
    // Layar di device kedua lewat WiFi tanpa internet (#205).
    // Id tetap per laptop: layar galeri (#281) mencari laptop ini lagi lewat id kalau IP berubah.
    const id = db.kv.get("stage_lan_id") || randomUUID().slice(0, 8);
    db.kv.set("stage_lan_id", id);
    startStageLan({
      id,
      name: boothName,
      rendererDir: join(__dirname, "../renderer"),
      sessionsRoot: () => join(app.getPath("userData"), "sessions"),
      state: tv.last,
      // Tetap per laptop: QR "HP crew" / layar staf yang sudah dibuka tetap berlaku setelah aplikasi dibuka ulang.
      key: (() => {
        const k = db.kv.get("stage_helper_key") || String(randomInt(1000, 10000));
        db.kv.set("stage_helper_key", k);
        return k;
      })(),
      // HP helper (#206) → layar operator (jendela TV mengabaikan).
      remote: (m) => {
        for (const w of BrowserWindow.getAllWindows()) w.webContents.send("stageRemote", m);
      },
      log,
    });
  }
  cloud.start();
  startMetrics(db, metricsEverySec, log);
});
app.on("window-all-closed", () => app.quit());
