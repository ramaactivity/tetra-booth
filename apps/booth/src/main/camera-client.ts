import { randomUUID } from "node:crypto";
import {
  type Command,
  type CommandResult,
  type CommandType,
  ReplySchema,
  ResultSchemas,
} from "@tetra/shared";

// ponytail: port & token tetap untuk dev. Fase 1: main spawn Camera Service dengan port & token acak (TSD §1).
const PORT = process.env.TETRA_CAMERA_PORT ?? "8765";
const TOKEN = process.env.TETRA_CAMERA_TOKEN ?? "dev";
const TIMEOUT_MS = 3000;

/** Kirim satu perintah ke Camera Service dan tunggu balasan dengan id yang sama. */
export function request<T extends CommandType>(
  cmd: Command & { type: T },
): Promise<CommandResult<T>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(TOKEN)}`);
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error("Camera Service tidak menjawab"));
    }, TIMEOUT_MS);
    const done = () => {
      clearTimeout(timer);
      ws.close();
    };
    ws.onopen = () => ws.send(JSON.stringify(cmd));
    ws.onerror = () => {
      done();
      reject(new Error("Camera Service tidak terhubung"));
    };
    ws.onmessage = (e) => {
      const msg = ReplySchema.safeParse(JSON.parse(String(e.data)));
      if (!msg.success || msg.data.id !== cmd.id) return;
      done();
      if (msg.data.type === "error") reject(new Error(msg.data.payload.message));
      else resolve(ResultSchemas[cmd.type].parse(msg.data.payload) as CommandResult<T>);
    };
  });
}

export const cameraHealth = () => request({ id: randomUUID(), type: "system.health" });
