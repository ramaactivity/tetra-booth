import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { PaperSchema, SESSION_ID_PATTERN } from "@tetra/shared";
import { app, ipcMain } from "electron";
import { z } from "zod";
import { cameraHealth, request } from "./camera-client";
import { config } from "./config";
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

export function registerIpc() {
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
    const r = await request({
      id: crypto.randomUUID(),
      type: "print.submit",
      payload: { ...j, path: inSessions(j.path) },
    });
    if (!r.accepted) throw new Error("print ditolak Camera Service");
  });

  ipcMain.on("phaseChanged", (e, phase: unknown) => {
    const p = z.string().max(32).safeParse(phase);
    if (p.success) onPhase(e.sender, p.data);
  });
}
