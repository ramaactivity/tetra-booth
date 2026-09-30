import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  AssetKindSchema,
  newerVersion,
  PairRequest,
  PaperSchema,
  PaymentCreateRequest,
  SESSION_ID_PATTERN,
} from "@tetra/shared";
import { app, BrowserWindow, ipcMain, net, shell } from "electron";
import { z } from "zod";
import type { Alerts } from "./alerts";
import { cameraHealth, liveViewUrl, request, ServiceUnavailable } from "./camera-client";
import type { Cloud } from "./cloud";
import {
  config,
  DeviceSettings,
  deviceFile,
  deviceNow,
  lockedByArgv,
  printerName,
  RESUME_KEY,
  UPDATE_PENDING_KEY,
} from "./config";
import { assetPath, createPinGuard, type LoadedBundle, loadBundles } from "./crew";
import type { BoothDb } from "./db";
import { CAMERA_PROPS, dcc, dccBase, dccProp } from "./dcc";
import { FOCUS_STEPS, focus, liveViewFrame, liveViewStart, liveViewStop } from "./digicam";
import {
  applyOverride,
  diffOverride,
  EventOverride,
  overrideKey,
  parseOverride,
} from "./event-override";
import { allowQuit, autoStart, setAutoStart } from "./kiosk";
import { onPhase } from "./shots";
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

  // Kamera lewat Camera Service (hot folder M7; nanti Canon EDSDK): foto ditulis service ke raw/ sesi.
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
  // Live view DSLR lewat digiCamControl (--digicam). Diambil di main supaya CSP renderer tetap 'self'.
  // Canon EDSDK (#111): live view & fokus lewat Camera Service; frame JPEG terbaru dari /liveview.jpg.
  const canonOn = config.camera === "canon";
  ipcMain.handle("liveViewStart", async () => {
    if (!config.liveView) return;
    if (canonOn) {
      await request({ id: crypto.randomUUID(), type: "liveview.start" }, 5000);
      if (deviceNow.afBeforeCapture)
        void request(
          { id: crypto.randomUUID(), type: "camera.focus", payload: { step: "af" } },
          5000,
        )
          .then(() => console.info("[camera] AF sebelum jepret"))
          .catch((e: unknown) => console.warn(`[camera] AF sebelum jepret gagal: ${String(e)}`));
      return;
    }
    await liveViewStart(!!deviceNow.afBeforeCapture);
    if (deviceNow.afBeforeCapture) console.info("[camera] AF sebelum jepret");
  });
  let lastCanonFrame: Buffer | undefined;
  ipcMain.handle("liveViewFrame", async () => {
    if (!config.liveView) throw new Error("live view tidak aktif");
    if (canonOn) {
      const r = await fetch(liveViewUrl(), { signal: AbortSignal.timeout(3000) });
      if (r.status !== 200) return new Uint8Array(0);
      // Camera Service selalu mengirim frame terakhir; renderer meminta lebih cepat dari 60D (±18 fps) sehingga tiap
      // frame di-decode ±4×. Frame yang sama = kosong, renderer menunggu 40 ms (sama seperti digiCamControl).
      const b = Buffer.from(await r.arrayBuffer());
      if (lastCanonFrame?.equals(b)) return new Uint8Array(0);
      lastCanonFrame = b;
      return new Uint8Array(b);
    }
    return liveViewFrame();
  });
  ipcMain.handle("liveViewStop", async () => {
    if (!config.liveView) return;
    if (canonOn) await request({ id: crypto.randomUUID(), type: "liveview.stop" }, 5000);
    else await liveViewStop();
  });

  ipcMain.handle("printSubmit", async (_e, job: unknown) => {
    const j = PrintJob.parse(job);
    const path = inSessions(j.path);
    // Write-ahead: baris queued ada sebelum event hasil bisa datang (M-012).
    if (
      !db.printSubmitting({
        id: j.jobId,
        sessionId: j.jobId,
        path,
        copies: j.copies,
        paper: j.paper,
      })
    )
      return;
    try {
      const r = await request({
        id: crypto.randomUUID(),
        type: "print.submit",
        payload: { ...j, path },
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
  ipcMain.handle("crewRetryUploads", async () => {
    crewOnly();
    await cloud.retryUploads();
  });
  ipcMain.handle("crewSyncEvents", async () => {
    crewOnly();
    try {
      return await cloud.syncEvents(true);
    } catch (e) {
      console.warn(`[cloud] sync event gagal: ${e instanceof Error ? e.message : String(e)}`);
      throw new Error("Tidak bisa mengunduh event dari cloud. Cek koneksi internet lalu coba lagi");
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
    (inflight ??= downloadInstaller(fresh, app.getPath("temp"), (p) => {
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
  ipcMain.handle("crewPair", (_e, code: unknown) => {
    crewOnly();
    return cloud.pair(PairRequest.shape.code.parse(code));
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
    const locked = ["camera", "printer", "hot-folder", "hot-folder-trigger"].filter(lockedByArgv);
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
    if (canonOn) return request({ id: crypto.randomUUID(), type: "camera.props" }, 8000);
    const base = dccBase();
    if (!base) return [];
    return (
      await Promise.all(CAMERA_PROPS.map(([name, label]) => dccProp(base, name, label)))
    ).filter((p) => p !== null);
  });
  ipcMain.handle("crewFocusAt", async (_e, x: unknown, y: unknown) => {
    crewOnly();
    if (!canonOn) throw new Error("Tap to focus hanya untuk DSLR Canon (EDSDK)");
    const at = { x: z.number().min(0).max(1).parse(x), y: z.number().min(0).max(1).parse(y) };
    await request({ id: crypto.randomUUID(), type: "camera.focusAt", payload: at }, 8000);
    console.info(`[camera] fokus di ${at.x.toFixed(2)},${at.y.toFixed(2)}`);
  });
  ipcMain.handle("crewFocus", async (_e, step: unknown) => {
    crewOnly();
    if (!config.liveView) throw new Error("Kontrol fokus hanya untuk DSLR dengan live view");
    const s = z.enum(FOCUS_STEPS).parse(step);
    if (canonOn) {
      await request({ id: crypto.randomUUID(), type: "camera.focus", payload: { step: s } }, 5000);
      console.info(`[camera] fokus ${s}`);
      return;
    }
    await focus(s).catch(() => {
      throw new Error("digiCamControl tidak menjawab. Cek kamera menyala & live view jalan");
    });
    console.info(`[camera] fokus ${s}`);
  });
  ipcMain.handle("crewSetCameraProp", async (_e, name: unknown, value: unknown) => {
    crewOnly();
    const base = dccBase();
    // Canon punya setelan tambahan: ISO jepret (flash) & kualitas JPEG (#113).
    const n = z
      .enum([
        ...CAMERA_PROPS.map(([k]) => k),
        ...(canonOn ? ["iso_capture", "shutter_capture", "quality"] : []),
      ] as [string, ...string[]])
      .parse(name);
    const v = z.string().min(1).max(64).parse(value);
    if (canonOn) {
      await request(
        { id: crypto.randomUUID(), type: "camera.setProp", payload: { name: n, value: v } },
        8000,
      );
      console.info(`[camera] ${n} = ${v}`);
      return;
    }
    if (!base) throw new Error("Kamera DSLR (digiCamControl) belum dipakai");
    const res = await dcc(base, { slc: "set", param1: n, param2: v }).catch(() => null);
    if (!res?.ok) throw new Error("digiCamControl menolak setelan. Cek kamera menyala & dial di M");
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
      win.setKiosk(false);
      win.once("focus", () => {
        if (!win.isDestroyed()) win.setKiosk(true);
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
    if (kiosk) win?.setKiosk(false);
    win?.minimize();
    try {
      await new Promise<void>((ok, fail) =>
        execFile("rundll32.exe", ["printui.dll,PrintUIEntry", "/e", "/n", name], (err) =>
          err ? fail(err) : ok(),
        ),
      );
    } finally {
      win?.restore();
      if (kiosk) win?.setKiosk(true);
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
  ipcMain.handle("eventsList", () =>
    reloadBundles().map(({ dir: _dir, ...b }) => applyOverride(b, overrideOf(b.id))),
  );
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
    return new Uint8Array(await readFile(assetPath(b, z.string().parse(assetId))));
  });

  ipcMain.handle("sessionStarted", (_e, x: unknown) => db.sessionStarted(SessionStarted.parse(x)));
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
