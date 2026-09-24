import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { PaperSchema, SESSION_ID_PATTERN } from "@tetra/shared";
import { app, ipcMain, net } from "electron";
import { z } from "zod";
import type { Alerts } from "./alerts";
import { cameraHealth, request } from "./camera-client";
import { config } from "./config";
import { assetPath, createPinGuard, type LoadedBundle, loadBundles } from "./crew";
import type { BoothDb } from "./db";
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

export function registerIpc(db: BoothDb, alerts: Alerts) {
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

  ipcMain.handle("printSubmit", async (_e, job: unknown) => {
    const j = PrintJob.parse(job);
    const path = inSessions(j.path);
    const row = { id: j.jobId, sessionId: j.jobId, path, copies: j.copies, paper: j.paper };
    try {
      const r = await request({
        id: crypto.randomUUID(),
        type: "print.submit",
        payload: { ...j, path },
      });
      if (!r.accepted) throw new Error("print ditolak Camera Service");
      db.printJob({ ...row, status: "queued" });
    } catch (e) {
      db.printJob({ ...row, status: "failed", error: e instanceof Error ? e.message : String(e) });
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
    };
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
    const r = await request({
      id: crypto.randomUUID(),
      type: "print.submit",
      payload: { jobId, path: inSessions(j.path), copies: j.copies, paper },
    });
    if (!r.accepted) throw new Error("print ditolak Camera Service");
    db.printJob({
      id: jobId,
      sessionId: j.session_id,
      path: j.path,
      copies: j.copies,
      paper,
      status: "queued",
    });
    db.printJobResult(j.id, "reprinted");
  });
  ipcMain.handle("crewExit", () => {
    crewOnly();
    app.quit();
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
    if (p.success) onPhase(e.sender, p.data);
  });
}
