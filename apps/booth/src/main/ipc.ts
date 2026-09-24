import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { PaperSchema, SESSION_ID_PATTERN } from "@tetra/shared";
import { app, ipcMain } from "electron";
import { z } from "zod";
import { cameraHealth, request } from "./camera-client";
import { config } from "./config";
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

export function registerIpc(db: BoothDb) {
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
