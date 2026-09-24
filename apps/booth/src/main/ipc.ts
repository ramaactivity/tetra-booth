import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { PairRequest, PaperSchema, SESSION_ID_PATTERN } from "@tetra/shared";
import { app, ipcMain, net } from "electron";
import { z } from "zod";
import type { Alerts } from "./alerts";
import { cameraHealth, request, ServiceUnavailable } from "./camera-client";
import type { Cloud } from "./cloud";
import { config } from "./config";
import { assetPath, createPinGuard, type LoadedBundle, loadBundles } from "./crew";
import type { BoothDb } from "./db";
import { allowQuit, autoStart, setAutoStart } from "./kiosk";
import { onPhase } from "./shots";

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
        kind: z.enum(["strip", "strip_web", "original", "thumb_strip", "thumb_original"]),
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
      paper: db.paper(),
      printer: alerts.printer(),
      cameraService,
      device: cloud.device(),
    };
  });
  ipcMain.handle("crewSyncEvents", () => {
    crewOnly();
    return cloud.syncEvents();
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
  ipcMain.handle("eventsList", () => reloadBundles().map(({ dir: _dir, ...b }) => b));
  ipcMain.handle("eventsActive", () => db.kv.get("active_event_id"));
  ipcMain.handle("eventsSetActive", (_e, id: unknown) => {
    crewOnly();
    db.kv.set("active_event_id", z.string().min(1).max(64).parse(id));
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
  });

  ipcMain.on("phaseChanged", (e, phase: unknown) => {
    const p = z.string().max(32).safeParse(phase);
    if (p.success) {
      onPhase(e.sender, p.data);
      onPhaseChanged(p.data);
    }
  });
}
