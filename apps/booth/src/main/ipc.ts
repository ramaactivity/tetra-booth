import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  AssetKindSchema,
  LayoutSpecSchema,
  newerVersion,
  outsideRun,
  PairRequest,
  PaperSchema,
  PaymentCreateRequest,
  RUN_ACTIONS,
  SESSION_ID_PATTERN,
} from "@tetra/shared";
import { app, BrowserWindow, clipboard, ipcMain, net, shell } from "electron";
import { z } from "zod";
import type { Alerts } from "./alerts";
import { cameraHealth, liveViewUrl, request, ServiceUnavailable } from "./camera-client";
import type { Cloud } from "./cloud";
import { cloudErrorText } from "./cloud-error";
import {
  config,
  DeviceSettings,
  dataDir,
  deviceFile,
  deviceNow,
  lockedByArgv,
  printerName,
  RESUME_KEY,
  SDK_CAMERAS,
  UPDATE_PENDING_KEY,
} from "./config";
import { assetPath, createPinGuard, type LoadedBundle, loadBundles } from "./crew";
import type { BoothDb } from "./db";
import {
  applyDesignOverride,
  assetRefs,
  designKey,
  layoutIds,
  parseDesignOverride,
  resetDesign,
  saveDesign,
} from "./design-override";
import { buildEventFolder, eventFolderSize, folderName, removableDrives } from "./event-folder";
import {
  applyOverride,
  diffOverride,
  EventOverride,
  overrideKey,
  parseOverride,
} from "./event-override";
import { allowQuit, autoStart, setAutoStart, setKioskOn } from "./kiosk";
import { onPhase } from "./shots";
import { stageInbox, stageListen } from "./stage";
import { stageHelperKey, stageLanUrls } from "./stage-lan";
import { downloadInstaller, runInstaller } from "./update";

/** %APPDATA%/TetraBooth/sessions (TSD §3). Renderer hanya boleh baca/tulis di bawah folder ini. */
const sessionsRoot = () => join(app.getPath("userData"), "sessions");

const inSessions = (p: string): string => {
  const abs = resolve(p);
  if (!abs.startsWith(sessionsRoot() + sep)) throw new Error("path di luar folder sesi");
  return abs;
};

const SessionId = z.string().regex(SESSION_ID_PATTERN);
const Path = z.string().min(1).max(1024);
const Bytes = z
  .instanceof(Uint8Array)
  .refine((b) => b.byteLength <= 100 * 1024 * 1024, "file > 100 MB");
const PrintJob = z.object({
  jobId: z.string().min(1).max(64),
  path: Path,
  copies: z.number().int().min(1).max(10),
  paper: PaperSchema,
});

const Iso = z.iso.datetime();
const Count = z.number().int().min(0).max(100);
const SessionStarted = z.object({
  id: z.string().regex(SESSION_ID_PATTERN),
  eventId: z.string().min(1).max(64),
  layoutVersionId: z.string().min(1).max(128),
  startedAt: Iso,
  paymentId: z.uuid().optional(),
  isTest: z.boolean().optional(),
  source: z.literal("stage").optional(),
  groupName: z.string().trim().max(120).nullable().optional(),
});
const SessionCompleted = z.object({
  id: z.string().regex(SESSION_ID_PATTERN),
  completedAt: Iso,
  photoCount: Count,
  retakeCount: Count,
  printCount: Count,
  assets: z
    .array(
      z.object({
        kind: AssetKindSchema,
        idx: Count,
        path: Path,
        bytes: z.number().int().min(0),
      }),
    )
    .max(64),
});

export function registerIpc(
  db: BoothDb,
  alerts: Alerts,
  cloud: Cloud,
  onPhaseChanged: (phase: string) => void = () => {},
  /** Setelah pairing berhasil (#198): mis. unduh DLL Canon yang belum ada lalu buka ulang booth. */
  onPaired: () => void = () => {},
) {
  const pins = createPinGuard({
    get: () => db.kv.get("crew_pin_hash"),
    set: (v) => db.kv.set("crew_pin_hash", v),
  });
  const crewOnly = () => {
    if (!pins.unlocked) throw new Error("mode crew terkunci");
  };
  const eventsDir = () => join(app.getPath("userData"), "events");
  let bundles: LoadedBundle[] = [];
  const reloadBundles = () => {
    bundles = loadBundles(eventsDir(), (m) => console.warn(m));
    return bundles;
  };
  reloadBundles();

  ipcMain.handle("config", () => config);
  ipcMain.handle("health", () => cameraHealth());

  ipcMain.handle("sessionDir", async (_e, id: unknown) => {
    const dir = join(sessionsRoot(), SessionId.parse(id));
    await Promise.all([
      mkdir(join(dir, "raw"), { recursive: true }),
      mkdir(join(dir, "out"), { recursive: true }),
    ]);
    return dir;
  });

  ipcMain.handle("writeFile", async (_e, path: unknown, bytes: unknown) => {
    const abs = inSessions(Path.parse(path));
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, Bytes.parse(bytes));
  });

  ipcMain.handle(
    "readFile",
    async (_e, path: unknown) => new Uint8Array(await readFile(inSessions(Path.parse(path)))),
  );

  // Kamera lewat Camera Service (Canon EDSDK, hot folder teknisi): foto ditulis service ke raw/ sesi.
  const CAPTURE_TIMEOUT_MS = 15_000;
  ipcMain.handle("cameraCapture", async (_e, req: unknown) => {
    const { sessionId, index } = z
      .object({ sessionId: SessionId, index: z.number().int().min(0).max(20) })
      .parse(req);
    const outputDir = join(sessionsRoot(), sessionId, "raw");
    await mkdir(outputDir, { recursive: true });
    const r = await request(
      { id: crypto.randomUUID(), type: "capture", payload: { sessionId, index, outputDir } },
      CAPTURE_TIMEOUT_MS,
    );
    return { ...r, path: inSessions(r.path) };
  });
  ipcMain.handle("cameraStatus", () => request({ id: crypto.randomUUID(), type: "camera.status" }));
  // Canon EDSDK (#111), Sony (#171), Lumix (#214) & Nikon (#216): live view & fokus lewat Camera Service; frame JPEG terbaru dari
  // /liveview.jpg. Diambil di main supaya CSP renderer tetap 'self'.
  const canonOn = SDK_CAMERAS.has(config.camera);
  ipcMain.handle("liveViewStart", async () => {
    if (!canonOn) return;
    // Frame pertama setelah live view dinyalakan ulang selalu dikirim, walau sama dengan frame terakhir sebelum jepret
    // (adegan diam / kamera palsu): tanpa ini LiveView yang baru dipasang tidak pernah mendapat frame.
    lastCanonFrame = undefined;
    await request({ id: crypto.randomUUID(), type: "liveview.start" }, 5000);
    if (deviceNow.afBeforeCapture)
      void request({ id: crypto.randomUUID(), type: "camera.focus", payload: { step: "af" } }, 5000)
        .then(() => console.info("[camera] AF sebelum jepret"))
        .catch((e: unknown) => console.warn(`[camera] AF sebelum jepret gagal: ${String(e)}`));
  });
  let lastCanonFrame: Buffer | undefined;
  ipcMain.handle("liveViewFrame", async () => {
    if (!canonOn) throw new Error("live view tidak aktif");
    const r = await fetch(liveViewUrl(), { signal: AbortSignal.timeout(3000) });
    if (r.status !== 200) return new Uint8Array(0);
    // Camera Service selalu mengirim frame terakhir; renderer meminta lebih cepat dari 60D (±18 fps) sehingga tiap
    // frame di-decode ±4×. Frame yang sama = kosong, renderer menunggu 40 ms.
    const b = Buffer.from(await r.arrayBuffer());
    if (lastCanonFrame?.equals(b)) return new Uint8Array(0);
    lastCanonFrame = b;
    return new Uint8Array(b);
  });
  ipcMain.handle("liveViewStop", async () => {
    if (canonOn) await request({ id: crypto.randomUUID(), type: "liveview.stop" }, 5000);
  });

  /** Jalur cetak sesi & galeri: write-ahead, Camera Service mati = tetap queued (dikirim ulang begitu pulih). */
  const sendPrint = async (j: {
    jobId: string;
    sessionId: string;
    path: string;
    copies: number;
    paper: z.infer<typeof PaperSchema>;
  }) => {
    // Write-ahead: baris queued ada sebelum event hasil bisa datang (M-012).
    if (!db.printSubmitting({ ...j, id: j.jobId })) return;
    try {
      const r = await request({
        id: crypto.randomUUID(),
        type: "print.submit",
        payload: { jobId: j.jobId, path: j.path, copies: j.copies, paper: j.paper },
      });
      if (!r.accepted) db.printJobResult(j.jobId, "failed", "print ditolak Camera Service");
    } catch (e) {
      if (e instanceof ServiceUnavailable) {
        // Camera Service sedang restart: tetap queued, dikirim ulang begitu pulih (M-009). Sesi tetap lanjut.
        db.printNote(j.jobId, `menunggu Camera Service: ${e.message}`);
        console.warn(`[print] tertunda ${j.jobId}: ${e.message}`);
        return;
      }
      db.printJobResult(j.jobId, "failed", e instanceof Error ? e.message : String(e));
      throw e;
    }
  };
  ipcMain.handle("printSubmit", async (_e, job: unknown) => {
    const j = PrintJob.parse(job);
    await sendPrint({ ...j, sessionId: j.jobId, path: inSessions(j.path) });
  });
  // Galeri tamu (#145): cetak lagi lembar cetak sesi selesai, maks. `max` lembar per sesi dari galeri.
  const Reprint = z.object({
    sessionId: SessionId,
    copies: z.number().int().min(1).max(10),
    max: z.number().int().min(1).max(10),
    paper: PaperSchema,
  });
  ipcMain.handle("printReprint", async (_e, req: unknown) => {
    const r = Reprint.parse(req);
    const used = db.reprinted(r.sessionId);
    if (used === undefined) throw new Error("sesi belum selesai");
    if (used + r.copies > r.max) return { jobId: null, reprinted: used };
    const path = join(sessionsRoot(), r.sessionId, "out", "strip.jpg");
    if (!existsSync(path)) throw new Error("lembar cetak sesi tidak ada");
    const jobId = `${r.sessionId}-g${Date.now().toString(36)}`;
    db.addPrints(r.sessionId, r.copies);
    console.info(`[gallery] cetak lagi ${jobId}: ${r.copies} lembar`);
    await sendPrint({ jobId, sessionId: r.sessionId, path, copies: r.copies, paper: r.paper });
    return { jobId, reprinted: used + r.copies };
  });

  // Mode crew (FSD §1.3). Semua aksi selain PIN butuh crew sudah masuk.
  const Pin = z.string().regex(/^\d{4,6}$/);
  ipcMain.handle("crewPinStatus", () => pins.status());
  ipcMain.handle("crewVerify", (_e, pin: unknown) => pins.verify(Pin.parse(pin)));
  ipcMain.handle("crewSetPin", (_e, pin: unknown) => pins.set(Pin.parse(pin)));
  ipcMain.handle("crewLock", () => pins.lock());
  ipcMain.handle("crewStatus", async () => {
    crewOnly();
    const cameraService = await cameraHealth().then(
      () => true,
      () => false,
    );
    return {
      online: net.isOnline(),
      uploadPending: db.uploadPending(),
      uploadError: db.uploadError(),
      paper: db.paper(),
      printer: alerts.printer(),
      cameraService,
      device: cloud.device(),
    };
  });
  // Timer event (#149): Buka untuk Tamu / Jeda / Lanjutkan / Selesai → antrean ke cloud, jam saat ditekan.
  const EventId = z.string().min(1).max(64);
  ipcMain.handle("crewRunState", (_e, id: unknown) => {
    crewOnly();
    return cloud.runState(EventId.parse(id));
  });
  ipcMain.handle("crewEventRun", async (_e, id: unknown, action: unknown) => {
    crewOnly();
    const eventId = EventId.parse(id);
    const a = z.enum([...RUN_ACTIONS, "arm"]).parse(action);
    // Hentikan Acara: ukuran folder event ikut terkirim (#166).
    const local = a === "finish" ? await eventFolderSize(db.eventFiles(eventId)) : undefined;
    return cloud.runAction(eventId, a, local);
  });
  // Rekap booth (#154): dihitung dari SQLite & timer lokal, jalan offline.
  ipcMain.handle("crewRecap", (_e, id: unknown) => {
    crewOnly();
    const eventId = EventId.parse(id);
    const run = cloud.runState(eventId) ? cloud.localRun(eventId) : null;
    return {
      ...db.recap(eventId),
      outside: run ? outsideRun(run, db.sessionTimes(eventId)) : 0,
      run,
      info: bundles.find((b) => b.id === eventId)?.info ?? {},
    };
  });
  // Ukuran isi "Buka Folder Event" + flashdisk terpasang (#166); dilaporkan ke cloud kalau online.
  ipcMain.handle("crewEventSize", async (_e, id: unknown) => {
    crewOnly();
    const eventId = EventId.parse(id);
    const [size, drives] = await Promise.all([
      eventFolderSize(db.eventFiles(eventId)),
      removableDrives(),
    ]);
    cloud.reportStorage(eventId, size);
    return { ...size, drives };
  });
  // "Buka folder event" (#155): kumpulkan file sesi asli event ini lalu buka di Explorer untuk disalin crew.
  ipcMain.handle("crewOpenEventFolder", async (e, id: unknown) => {
    crewOnly();
    const eventId = EventId.parse(id);
    const name = bundles.find((b) => b.id === eventId)?.name ?? eventId;
    // --data (dev/e2e) = folder data sendiri, supaya Dokumen laptop tidak terisi data uji.
    const root = dataDir
      ? join(dataDir, "Foto Event")
      : join(app.getPath("documents"), "Tetra Booth");
    const dest = join(root, folderName(name));
    const added = await buildEventFolder(dest, db.eventFiles(eventId));
    console.info(`[crew] folder event ${dest} (+${added} file)`);
    // Uji otomatis: jangan membuka Explorer/Finder.
    if (process.env.TETRA_NO_SHELL_OPEN !== "1") {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (win?.isKiosk()) {
        setKioskOn(win, false);
        win.once("focus", () => {
          if (!win.isDestroyed()) setKioskOn(win, true);
        });
      }
      // Jendela booth tidak diperkecil (#170): Explorer muncul di depan, mode crew tetap terbuka di belakangnya.
      // Dulu diperkecil → kembali ke booth, webcam bisa sudah mati dan tamu tertahan di layar kamera bermasalah.
      const err = await shell.openPath(dest);
      if (err) throw new Error(`Folder tidak bisa dibuka: ${err}`);
    }
    return dest;
  });
  // "Salin link galeri" (#155): aktifkan link galeri klien di cloud, salin alamatnya ke clipboard.
  ipcMain.handle("crewGalleryLink", async (_e, id: unknown) => {
    crewOnly();
    let slug: string;
    try {
      slug = await cloud.galleryLink(EventId.parse(id));
    } catch (err) {
      console.warn(
        `[cloud] link galeri gagal: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new Error(
        cloudErrorText(
          err,
          "Link galeri butuh internet. Sambungkan booth ke internet lalu coba lagi",
        ),
      );
    }
    const url = `${config.guestUrl}/g/${slug}`;
    clipboard.writeText(url);
    return url;
  });
  ipcMain.handle("crewRetryUploads", async () => {
    crewOnly();
    await cloud.retryUploads();
  });
  // "Tajamkan foto lama" (#140): sesi yang belum punya potongan web 2×, foto raw urut nomor.
  ipcMain.handle("crewOldSessions", () => {
    crewOnly();
    return db.webSessions().flatMap(({ id, eventId }) => {
      const dir = join(sessionsRoot(), id);
      const out = (f: string) => join(dir, "out", f);
      if (!existsSync(dir) || existsSync(out("piece@2x.jpg"))) return [];
      const raw = existsSync(join(dir, "raw")) ? readdirSync(join(dir, "raw")) : [];
      const photos = raw
        .filter((f) => /^\d+\.jpg$/.test(f))
        .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
        .map((f) => join(dir, "raw", f));
      const piece = [out("piece.jpg"), out("strip.jpg")].find((f) => existsSync(f)) ?? null;
      return [{ id, eventId, photos, piece }];
    });
  });
  const Reupload = z
    .array(
      z.object({
        kind: z.enum(["strip_web", "thumb_strip"]),
        idx: z.literal(0),
        path: Path,
        bytes: z.number().int().min(1),
      }),
    )
    .min(1)
    .max(2);
  ipcMain.handle("crewReupload", (_e, id: unknown, assets: unknown) => {
    crewOnly();
    const sessionId = SessionId.parse(id);
    const dir = join(sessionsRoot(), sessionId) + sep;
    const list = Reupload.parse(assets).map((a) => {
      const path = inSessions(a.path);
      if (!path.startsWith(dir)) throw new Error("path di luar folder sesi");
      return { ...a, path };
    });
    db.reupload(sessionId, list, new Date().toISOString());
    cloud.kickUpload();
  });
  ipcMain.handle("crewSyncEvents", async () => {
    crewOnly();
    try {
      return await cloud.syncEvents(true);
    } catch (e) {
      console.warn(`[cloud] sync event gagal: ${e instanceof Error ? e.message : String(e)}`);
      throw new Error(
        cloudErrorText(
          e,
          "Tidak bisa mengunduh event dari cloud. Cek koneksi internet lalu coba lagi",
        ),
      );
    }
  });
  // Update aplikasi (aturan 7: hanya dari mode crew, DECISIONS #80).
  const release = async () => {
    const current = app.getVersion();
    let r: Awaited<ReturnType<typeof cloud.latestRelease>>;
    try {
      r = await cloud.latestRelease();
    } catch (e) {
      console.warn(`[update] cek gagal: ${e instanceof Error ? e.message : String(e)}`);
      throw new Error(
        "Tidak bisa cek update. Pastikan booth sudah dipasangkan dan internet menyala",
      );
    }
    return { current, r, available: !!r && newerVersion(r.version, current) };
  };
  // Satu unduhan installer bersama untuk unduhan latar belakang & tombol Pasang Sekarang (#89, W-032).
  let inflight: Promise<string> | null = null;
  let ready: string | null = null; // versi yang installer-nya sudah lengkap di folder temp
  let listener: Electron.WebContents | null = null;
  let sent = 0;
  const fresh = async () => {
    const x = await cloud.latestRelease();
    if (!x) throw new Error("rilis tidak ditemukan");
    return x;
  };
  const getInstaller = (version: string) =>
    (inflight ??= downloadInstaller(fresh, join(app.getPath("userData"), "updates"), (p) => {
      // Progress ke layar crew paling sering tiap 500 ms.
      const now = Date.now();
      if (now - sent < 500 && p.received < p.total) return;
      sent = now;
      if (listener && !listener.isDestroyed()) listener.send("updateProgress", p);
    })
      .then((f) => {
        // Versi yang benar-benar terunduh (bisa beda dari yang diminta kalau unduhan lama masih jalan).
        ready = /Setup-(.+)\.exe$/.exec(f)?.[1] ?? version;
        return f;
      })
      .finally(() => {
        inflight = null;
      }));
  // Unduh di latar belakang saat senggang (antrean upload kosong): crew cukup memasang ±1 menit di lokasi.
  // Hanya build terpasang Windows; update tetap dipasang manual oleh crew (aturan 7).
  const prefetch = async () => {
    if (process.platform !== "win32" || !app.isPackaged || inflight || db.uploadPending() > 0)
      return;
    const { r, available } = await release().catch(() => ({ r: null, available: false }));
    if (!r || !available || ready === r.version) return;
    console.info(`[update] unduh latar belakang ${r.version} (${Math.round(r.size / 1e6)} MB)`);
    await getInstaller(r.version).then(
      () => console.info(`[update] ${r.version} siap dipasang`),
      (e: unknown) =>
        console.warn(
          `[update] unduh latar belakang gagal: ${e instanceof Error ? e.message : String(e)}`,
        ),
    );
  };
  setTimeout(() => void prefetch(), 2 * 60_000).unref();
  setInterval(() => void prefetch(), 3 * 60 * 60_000).unref();

  ipcMain.handle("crewCheckUpdate", async () => {
    crewOnly();
    const { current, r, available } = await release();
    return { current, latest: r?.version ?? null, available, ready: !!r && ready === r.version };
  });
  ipcMain.handle("crewInstallUpdate", async (e) => {
    crewOnly();
    if (process.platform !== "win32") throw new Error("Update hanya untuk booth Windows");
    const { r, available } = await release();
    if (!r || !available) throw new Error("Sudah versi terbaru");
    listener = e.sender;
    // Log "memakai … yang sudah diunduh" / "mengunduh …" ditulis downloadInstaller (tahu isi folder temp).
    console.info(`[update] menyiapkan ${r.version}`);
    // Unduhan latar belakang versi lama masih jalan → tunggu selesai, lalu unduh versi yang diminta.
    // Kegagalan sungguhan tidak diulang di sini (crew menekan Coba Lagi); hanya versi lama/tergantikan yang diulang.
    const get = async () => {
      const f = await getInstaller(r.version).catch((e: unknown) => {
        if (e instanceof Error && e.message.includes("terbit saat mengunduh")) return null;
        throw e;
      });
      return f?.endsWith(`-${r.version}.exe`) ? f : getInstaller(r.version);
    };
    const file = await get().catch((err: unknown) => {
      console.warn(`[update] unduh gagal: ${err instanceof Error ? err.message : String(err)}`);
      throw new Error(
        "Gagal mengunduh update. Cek internet lalu tekan Pasang Sekarang lagi (unduhan dilanjutkan)",
      );
    });
    console.info(`[update] memasang ${r.version}, aplikasi ditutup`);
    // Dicek saat booth terbuka lagi: versi = to → "berhasil", selain itu "gagal dipasang" (masukan Rama).
    db.kv.set(UPDATE_PENDING_KEY, JSON.stringify({ from: app.getVersion(), to: r.version }));
    db.kv.set(RESUME_KEY, "1");
    runInstaller(file);
    allowQuit();
    app.quit();
  });
  ipcMain.handle("crewPair", async (_e, code: unknown) => {
    crewOnly();
    const d = await cloud.pair(PairRequest.shape.code.parse(code));
    onPaired();
    return d;
  });
  ipcMain.handle("crewResetPaper", (_e, capacity: unknown) => {
    crewOnly();
    db.resetPaper(z.number().int().min(1).max(5000).parse(capacity));
    alerts.refresh();
  });
  ipcMain.handle("crewFailedPrints", () => {
    crewOnly();
    return db
      .failedPrints()
      .map((j) => ({ id: j.id, copies: j.copies, error: j.error, createdAt: j.created_at }));
  });
  ipcMain.handle("crewReprint", async (_e, id: unknown) => {
    crewOnly();
    const j = db.printJobById(z.string().min(1).max(64).parse(id));
    if (!j) throw new Error("job tidak ditemukan");
    const paper = PaperSchema.parse(j.paper);
    const jobId = `${j.session_id}-r${Date.now().toString(36)}`;
    const path = inSessions(j.path);
    db.printSubmitting({ id: jobId, sessionId: j.session_id, path, copies: j.copies, paper });
    db.printReprinted(j.id);
    const newJobId = jobId;
    try {
      const r = await request({
        id: crypto.randomUUID(),
        type: "print.submit",
        payload: { jobId, path, copies: j.copies, paper },
      });
      if (!r.accepted) throw new Error("print ditolak Camera Service");
    } catch (e) {
      db.printJobResult(jobId, "failed", e instanceof Error ? e.message : String(e));
      throw e;
    }
    return newJobId;
  });

  ipcMain.handle("crewExit", () => {
    crewOnly();
    allowQuit();
    app.quit();
  });
  // Dialog driver tampil di belakang jendela kiosk, jadi kiosk dilepas sampai dialog ditutup.
  // Kamera & printer dari mode crew (DECISIONS #85). Simpan = tulis device.json lalu booth dibuka ulang.
  ipcMain.handle("crewDevice", async (e) => {
    crewOnly();
    const printers = (await e.sender.getPrintersAsync()).map((p) => p.name);
    const locked = ["camera", "printer", "hot-folder", "hot-folder-trigger", "role"].filter(
      lockedByArgv,
    );
    return { now: deviceNow, locked, printers };
  });
  ipcMain.handle("crewSaveDevice", async (_e, s: unknown) => {
    crewOnly();
    const settings = DeviceSettings.parse(s);
    await mkdir(dirname(deviceFile), { recursive: true });
    await writeFile(deviceFile, JSON.stringify(settings, null, 2));
    console.info(`[config] mode crew menyimpan ${JSON.stringify(settings)}, booth dibuka ulang`);
    db.kv.set(RESUME_KEY, "1");
    allowQuit();
    app.relaunch({ args: process.argv.slice(1) });
    app.quit();
    setTimeout(() => app.exit(0), 30_000).unref();
  });
  ipcMain.handle("crewCameraProps", async () => {
    crewOnly();
    return canonOn ? request({ id: crypto.randomUUID(), type: "camera.props" }, 8000) : [];
  });
  ipcMain.handle("crewFocusAt", async (_e, x: unknown, y: unknown) => {
    crewOnly();
    if (!canonOn) throw new Error("Tap to focus hanya untuk kamera Canon / Sony");
    const at = { x: z.number().min(0).max(1).parse(x), y: z.number().min(0).max(1).parse(y) };
    const r = await request({ id: crypto.randomUUID(), type: "camera.focusAt", payload: at }, 8000);
    if (!r.ok) throw new Error("Kamera ini tidak mendukung tap to focus");
    console.info(`[camera] fokus di ${at.x.toFixed(2)},${at.y.toFixed(2)}`);
  });
  ipcMain.handle("crewFocus", async (_e, step: unknown) => {
    crewOnly();
    if (!canonOn) throw new Error("Kontrol fokus hanya untuk kamera Canon / Sony / Lumix / Nikon");
    const s = z.enum(["af", "near3", "near2", "near1", "far1", "far2", "far3"]).parse(step);
    await request({ id: crypto.randomUUID(), type: "camera.focus", payload: { step: s } }, 5000);
    console.info(`[camera] fokus ${s}`);
  });
  ipcMain.handle("crewSetCameraProp", async (_e, name: unknown, value: unknown) => {
    crewOnly();
    if (!canonOn) throw new Error("Setelan kamera hanya untuk kamera Canon / Sony / Lumix / Nikon");
    // Canon (#113): eksposur live view + ISO/shutter jepret (flash) & kualitas JPEG. Sony (#171), Lumix (#214), Nikon (#216): + EV.
    const n = z
      .enum([
        "iso",
        "shutterspeed",
        "aperture",
        "whitebalance",
        "iso_capture",
        "shutter_capture",
        "quality",
        "exposurecomp",
      ])
      .parse(name);
    const v = z.string().min(1).max(64).parse(value);
    await request(
      { id: crypto.randomUUID(), type: "camera.setProp", payload: { name: n, value: v } },
      8000,
    );
    console.info(`[camera] ${n} = ${v}`);
  });

  // Hasil update terakhir, sekali per catatan (boot pertama setelah update); tanpa crew karena tampil di layar awal.
  ipcMain.handle("updateResult", () => {
    const raw = db.kv.get(UPDATE_PENDING_KEY);
    if (!raw) return null;
    db.kv.set(UPDATE_PENDING_KEY, "");
    try {
      const { from, to } = z.object({ from: z.string(), to: z.string() }).parse(JSON.parse(raw));
      const now = app.getVersion();
      console.info(
        `[update] ${now === to ? "berhasil" : "gagal dipasang"}: ${from} → ${to} (terpasang ${now})`,
      );
      return { ok: now === to, from, to, now };
    } catch {
      return null;
    }
  });
  // Dashboard admin di browser bawaan. Kiosk dilepas & jendela diperkecil; kembali kiosk saat booth dibuka lagi.
  ipcMain.handle("crewOpenAdmin", async (e, path: unknown) => {
    crewOnly();
    // Hanya halaman di bawah /admin (mis. /admin/events/<id>/settings dari tombol Edit event).
    const p = z
      .string()
      .regex(/^\/admin(\/[\w-]+)*$/)
      .optional()
      .parse(path ?? undefined);
    const win = BrowserWindow.fromWebContents(e.sender);
    await shell.openExternal(`${config.guestUrl}${p ?? "/admin"}`);
    if (win?.isKiosk()) {
      setKioskOn(win, false);
      win.once("focus", () => {
        if (!win.isDestroyed()) setKioskOn(win, true);
      });
    }
    win?.minimize();
    console.info("[crew] dashboard admin dibuka di browser");
  });
  ipcMain.handle("crewPrinterSettings", async (e) => {
    crewOnly();
    if (process.platform !== "win32") throw new Error("Pengaturan printer hanya di Windows");
    const name = printerName;
    if (!name) throw new Error("Printer belum dikonfigurasi (--printer)");
    const win = BrowserWindow.fromWebContents(e.sender);
    const kiosk = win?.isKiosk() ?? false;
    if (kiosk && win) setKioskOn(win, false);
    win?.minimize();
    try {
      await new Promise<void>((ok, fail) =>
        execFile("rundll32.exe", ["printui.dll,PrintUIEntry", "/e", "/n", name], (err) =>
          err ? fail(err) : ok(),
        ),
      );
    } finally {
      win?.restore();
      if (kiosk && win) setKioskOn(win, true);
      win?.focus();
    }
    console.info(`[print] dialog Printing Preferences ${name} ditutup`);
  });
  ipcMain.handle("crewAutoStart", () => {
    crewOnly();
    return autoStart();
  });
  ipcMain.handle("crewSetAutoStart", (_e, on: unknown) => {
    crewOnly();
    setAutoStart(z.boolean().parse(on));
    console.info(`[kiosk] auto-start ${on ? "aktif" : "mati"}`);
    return autoStart();
  });
  ipcMain.handle("printerAlert", () => alerts.get());

  // Event lokal dari bundle (M6); Fase 2 mengisi folder yang sama lewat sync.
  const overrideOf = (id: string) => parseOverride(db.kv.get(overrideKey(id)));
  // Font pustaka editor ada di aset renderer (`public/fonts` → `out/renderer/fonts`, di dalam asar saat terpasang).
  const libFontPath = (name: string) =>
    [
      join(__dirname, "../renderer/fonts", `${name}.woff2`),
      join(app.getAppPath(), "src/renderer/public/fonts", `${name}.woff2`),
    ].find((f) => existsSync(f));
  const designOf = (id: string) => parseDesignOverride(db.kv.get(designKey(id)));
  const localDir = (id: string) => join(eventsDir(), id, "local");
  ipcMain.handle("eventsList", () =>
    reloadBundles().map(({ dir: _dir, ...b }) =>
      applyDesignOverride(applyOverride(b, overrideOf(b.id)), designOf(b.id)),
    ),
  );
  // Layar awal (#143): hasil desain sesi selesai event ini; thumb (960 px) dulu, lalu potongan web/cetak.
  // Tanpa PIN (layar tamu), hanya path di folder sesi; renderer membacanya lewat readFile.
  ipcMain.handle("eventsRecentPieces", (_e, id: unknown, limit: unknown, before: unknown) => {
    const eventId = z.string().min(1).max(64).parse(id);
    const pick = (sid: string, names: string[]) =>
      names.map((n) => join(sessionsRoot(), sid, "out", n)).find((p) => existsSync(p));
    const hours = db.sessionHours(eventId);
    const pieces = db
      .recentSessions(
        eventId,
        z.number().int().min(1).max(48).parse(limit),
        Iso.optional().parse(before),
      )
      .flatMap(({ id: sessionId, ...s }) => {
        const path = pick(sessionId, ["thumb_strip.jpg", "piece@2x.jpg", "piece.jpg", "strip.jpg"]);
        // Galeri (#145): sumber paling tajam; strip.jpg (lembar cetak) hanya kalau potongan tidak ada.
        const full = pick(sessionId, ["piece@2x.jpg", "piece.jpg", "strip.jpg", "thumb_strip.jpg"]);
        return path && full ? [{ ...s, sessionId, path, full }] : [];
      });
    return { total: hours.reduce((a, h) => a + h.n, 0), hours, pieces };
  });
  // Desain diedit di booth (DECISIONS #128/#131): layout.id → waktu simpan, hanya layout yang masih ada di bundle.
  ipcMain.handle("crewDesigns", (_e, id: unknown) => {
    crewOnly();
    const b = bundles.find((x) => x.id === z.string().parse(id));
    if (!b) throw new Error("event tidak ditemukan");
    const ids = layoutIds(b);
    return Object.fromEntries(Object.entries(designOf(b.id).savedAt).filter(([k]) => ids.has(k)));
  });
  const DesignFile = z.object({
    assetId: z.string().regex(/^[\w][\w.-]{0,80}$/),
    ext: z.enum(["png", "jpg", "jpeg", "ttf", "otf", "woff", "woff2"]),
    bytes: z.instanceof(Uint8Array),
  });
  ipcMain.handle("crewSaveDesign", async (_e, id: unknown, layout: unknown, files: unknown) => {
    crewOnly();
    const b = bundles.find((x) => x.id === z.string().parse(id));
    if (!b) throw new Error("event tidak ditemukan");
    const l = LayoutSpecSchema.parse(layout);
    if (!layoutIds(b).has(l.id)) throw new Error("desain tidak ada di event ini");
    const add: { assetId: string; ext: string; bytes: Uint8Array }[] = z
      .array(DesignFile)
      .max(12)
      .parse(files);
    // Setiap aset yang dirujuk harus ada: di bundle, di override lama, atau ikut disimpan sekarang.
    const cur = designOf(b.id);
    const known = new Set([
      ...Object.keys(b.assets),
      ...Object.keys(cur.assets),
      ...add.map((f) => f.assetId),
      "geist",
    ]);
    // Font pustaka yang baru dipilih di editor: salin dari font renderer (offline, sama dengan admin).
    for (const a of assetRefs(l)) {
      if (known.has(a) || !/^lib-[a-z0-9-]+$/.test(a)) continue;
      const src = libFontPath(a.slice(4));
      if (!src) continue;
      add.push({ assetId: a, ext: "woff2", bytes: new Uint8Array(await readFile(src)) });
      known.add(a);
    }
    const missing = assetRefs(l).filter((a) => !known.has(a));
    if (missing.length) throw new Error(`aset tidak ada: ${missing.join(", ")}`);
    const dir = localDir(b.id);
    await mkdir(dir, { recursive: true });
    const written: Record<string, string> = {};
    for (const f of add) {
      const name = `${f.assetId}.${f.ext}`;
      await writeFile(join(dir, name), f.bytes);
      written[f.assetId] = name;
    }
    const { next, unused } = saveDesign(cur, l, written, new Date().toISOString());
    db.kv.set(designKey(b.id), JSON.stringify(next));
    for (const f of unused) await rm(join(dir, f), { force: true });
    console.info(
      `[event] desain ${l.id} di ${b.id} diedit di booth (${Object.keys(written).length} aset baru)`,
    );
    return next.savedAt[l.id];
  });
  ipcMain.handle("crewResetDesign", async (_e, id: unknown, layoutId: unknown) => {
    crewOnly();
    const eid = z.string().parse(id);
    const { next, unused } = resetDesign(designOf(eid), z.string().nullable().parse(layoutId));
    db.kv.set(designKey(eid), Object.keys(next.layouts).length ? JSON.stringify(next) : "");
    for (const f of unused) await rm(join(localDir(eid), f), { force: true });
    console.info(`[event] desain ${layoutId ?? "semua"} di ${eid} dikembalikan ke cloud`);
  });
  // Override pengaturan event di booth (DECISIONS #100): nilai cloud + override lokal; null = kembalikan ke cloud.
  ipcMain.handle("crewEventSettings", (_e, id: unknown) => {
    crewOnly();
    const b = bundles.find((x) => x.id === z.string().parse(id));
    if (!b) throw new Error("event tidak ditemukan");
    return { cloud: b.settings, override: overrideOf(b.id) };
  });
  ipcMain.handle("crewSetEventSettings", (_e, id: unknown, next: unknown) => {
    crewOnly();
    const b = bundles.find((x) => x.id === z.string().parse(id));
    if (!b) throw new Error("event tidak ditemukan");
    const o = next === null ? {} : diffOverride(b.settings, EventOverride.parse(next));
    db.kv.set(overrideKey(b.id), Object.keys(o).length ? JSON.stringify(o) : "");
    console.info(`[event] pengaturan ${b.id} di booth: ${JSON.stringify(o)}`);
    return { cloud: b.settings, override: o };
  });
  ipcMain.handle("eventsActive", () => db.kv.get("active_event_id"));
  ipcMain.handle("eventsSetActive", (_e, id: unknown) => {
    // Layar awal saat app dibuka manual: satu kali pilih tanpa PIN (DECISIONS #86); selanjutnya lewat mode crew.
    if (!config.startScreen) crewOnly();
    db.kv.set("active_event_id", z.string().min(1).max(64).parse(id));
    config.startScreen = false;
  });
  ipcMain.handle("eventAsset", async (_e, eventId: unknown, assetId: unknown) => {
    const b = bundles.find((x) => x.id === z.string().parse(eventId));
    if (!b) throw new Error("event tidak ditemukan");
    const a = z.string().parse(assetId);
    // Aset desain yang diedit di booth ada di folder local/, bukan di bundle.
    const local = designOf(b.id).assets[a];
    return new Uint8Array(await readFile(local ? join(localDir(b.id), local) : assetPath(b, a)));
  });

  // Photo Stage (#178): dengar rana fotografer; jepretan masuk ke _stage-inbox (di dalam folder sesi, jadi bisa
  // dibaca renderer lewat readFile). Ganti nama grup tersinkron ke cloud lewat uploader (dueMeta).
  ipcMain.handle("stageListen", (_e, on: unknown) =>
    stageListen(z.boolean().parse(on) ? stageInbox(sessionsRoot()) : null),
  );
  ipcMain.handle("stageRename", (_e, id: unknown, name: unknown) => {
    db.sessionRename(
      SessionId.parse(id),
      z.string().trim().max(120).nullable().parse(name) || null,
    );
    cloud.kickUpload();
  });

  // Riwayat laptop stage (#195): sembunyikan foto per idx, tambah foto ke rombongan lama (Gabung).
  ipcMain.handle("stageHide", (_e, id: unknown, idx: unknown) => {
    db.stageHide(SessionId.parse(id), z.array(Count.min(1)).max(20).parse(idx));
    cloud.kickUpload();
  });
  ipcMain.handle("stageAppend", (_e, id: unknown, photoCount: unknown, assets: unknown) => {
    db.stageAppend(
      SessionId.parse(id),
      z.number().int().min(1).max(20).parse(photoCount),
      SessionCompleted.shape.assets.parse(assets),
    );
    cloud.kickUpload();
  });

  // Status bar layar operator (#186): kamera, internet, rombongan yang belum terunggah. Tanpa crew.
  ipcMain.handle("stageStatus", async (_e, ids: unknown) => {
    const list = z.array(SessionId).max(50).parse(ids);
    const camera = await request({ id: crypto.randomUUID(), type: "camera.status" }).then(
      (r) => ({ connected: r.connected, model: r.model }),
      () => null,
    );
    return {
      online: net.isOnline(),
      camera,
      lanUrls: stageLanUrls(),
      helperKey: stageHelperKey(),
      ...db.stageUploads(list),
    };
  });

  ipcMain.handle("sessionStarted", (_e, x: unknown) => {
    const s = SessionStarted.parse(x);
    db.sessionStarted(s);
    // "Mulai acara" (#152): sesi tamu pertama memulai timer; sesi tes tidak.
    if (!s.isTest) cloud.sessionStarted(s.eventId, s.startedAt);
  });
  ipcMain.handle("sessionCompleted", (_e, x: unknown) => {
    const s = SessionCompleted.parse(x);
    db.sessionCompleted({
      ...s,
      assets: s.assets.map((a) => ({ ...a, path: inSessions(a.path) })),
    });
    cloud.kickUpload();
  });

  // Photobox (Fase 4): nominal tidak pernah dikirim booth; server menghitung dari pengaturan event.
  ipcMain.handle("paymentCreate", (_e, x: unknown) =>
    cloud.createPayment(PaymentCreateRequest.parse(x)),
  );
  ipcMain.handle("paymentStatus", (_e, id: unknown) => cloud.paymentStatus(z.uuid().parse(id)));

  ipcMain.on("phaseChanged", (e, phase: unknown) => {
    const p = z.string().max(32).safeParse(phase);
    if (p.success) {
      onPhase(e.sender, p.data);
      onPhaseChanged(p.data);
    }
  });
}
