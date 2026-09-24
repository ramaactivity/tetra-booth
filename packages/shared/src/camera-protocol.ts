import { z } from "zod";
import { PaperSchema } from "./paper";

/**
 * Protokol WebSocket Electron ↔ Tetra Camera Service. TSD §2.
 * Pesan teks JSON `{ id, type, payload }`. Balasan memakai `id` yang sama. Event tanpa `id`.
 * Frame live view = pesan biner, byte 0 = LIVEVIEW_FRAME_TAG, sisanya JPEG.
 */
export const LIVEVIEW_FRAME_TAG = 0x01;

const id = z.string().min(1);
const empty = z.undefined().optional();

const cmd = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ id, type: z.literal(type), payload });

export const CommandSchema = z.discriminatedUnion("type", [
  cmd("camera.list", empty),
  cmd("camera.connect", z.object({ id: z.string().min(1) })),
  cmd("camera.status", empty),
  cmd("liveview.start", empty),
  cmd("liveview.stop", empty),
  cmd(
    "capture",
    z.object({
      sessionId: z.string().min(1),
      index: z.number().int().nonnegative(),
      outputDir: z.string().min(1),
    }),
  ),
  cmd(
    "print.submit",
    z.object({
      jobId: z.string().min(1),
      path: z.string().min(1),
      copies: z.number().int().positive(),
      paper: PaperSchema,
    }),
  ),
  cmd("print.status", z.object({ jobId: z.string().min(1) })),
  cmd("system.health", empty),
]);
export type Command = z.infer<typeof CommandSchema>;
export type CommandType = Command["type"];

export const CameraInfoSchema = z.object({
  id: z.string(),
  brand: z.enum(["canon", "sony", "hotfolder"]),
  model: z.string(),
  serial: z.string(),
});

export const PrintJobStatusSchema = z.enum(["queued", "printing", "done", "failed"]);

/** Payload balasan per jenis perintah. */
export const ResultSchemas = {
  "camera.list": z.array(CameraInfoSchema),
  "camera.connect": z.object({ ok: z.boolean() }),
  "camera.status": z.object({
    connected: z.boolean(),
    model: z.string().nullable(),
    battery: z.number().int().min(0).max(100).nullable(),
    shotsRemaining: z.number().int().nullable(),
  }),
  "liveview.start": z.object({ ok: z.boolean() }),
  "liveview.stop": z.object({ ok: z.boolean() }),
  capture: z.object({ path: z.string(), width: z.number().int(), height: z.number().int() }),
  "print.submit": z.object({ accepted: z.boolean() }),
  "print.status": z.object({ status: PrintJobStatusSchema, error: z.string().optional() }),
  "system.health": z.object({
    uptime: z.number().nonnegative(),
    camera: z.enum(["connected", "disconnected"]),
    printer: z.enum(["ready", "error", "unavailable"]),
    /** Pemakaian memori & handle Camera Service (M8, deteksi leak). Opsional untuk kompatibilitas. */
    workingSetMb: z.number().nonnegative().optional(),
    handles: z.number().int().nonnegative().optional(),
  }),
} as const satisfies Record<CommandType, z.ZodType>;

export type CommandResult<T extends CommandType> = z.infer<(typeof ResultSchemas)[T]>;

export const ErrorReplySchema = z.object({
  id,
  type: z.literal("error"),
  payload: z.object({ code: z.string().min(1), message: z.string() }),
});

/** Balasan sukses: `type` sama dengan perintah, `id` sama. */
export const ReplySchema = z.union([
  ...(Object.keys(ResultSchemas) as CommandType[]).map((t) =>
    z.object({ id, type: z.literal(t), payload: ResultSchemas[t] }),
  ),
  ErrorReplySchema,
]);
export type Reply = z.infer<typeof ReplySchema>;

const evt = <T extends string, P extends z.ZodType>(type: T, payload: P) =>
  z.object({ type: z.literal(type), payload });

export const EventSchema = z.discriminatedUnion("type", [
  evt("camera.connected", CameraInfoSchema),
  evt("camera.disconnected", z.object({ id: z.string() })),
  evt(
    "capture.failed",
    z.object({
      sessionId: z.string(),
      index: z.number().int(),
      code: z.string(),
      message: z.string(),
    }),
  ),
  evt("print.done", z.object({ jobId: z.string() })),
  evt("print.failed", z.object({ jobId: z.string(), code: z.string(), message: z.string() })),
  evt(
    "printer.status",
    z.object({
      status: z.enum(["ready", "error", "unavailable"]),
      paperRemaining: z.number().int().nullable(),
      message: z.string().optional(),
    }),
  ),
]);
export type ServiceEvent = z.infer<typeof EventSchema>;

/** Semua pesan teks yang bisa datang dari Camera Service. */
export const ServiceMessageSchema = z.union([ReplySchema, EventSchema]);
export type ServiceMessage = z.infer<typeof ServiceMessageSchema>;
