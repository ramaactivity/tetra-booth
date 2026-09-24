import { randomUUID } from "node:crypto";
import {
  type Command,
  type CommandResult,
  type CommandType,
  ReplySchema,
  ResultSchemas,
} from "@tetra/shared";

// Default = Camera Service yang dijalankan manual (--no-spawn). Supervisor mengganti dengan port & token acak (TSD §1).
let endpoint = { port: 8765, token: "dev" };
export const setEndpoint = (port: number, token: string) => {
  endpoint = { port, token };
};
const TIMEOUT_MS = 3000;

/** Kirim satu perintah ke Camera Service dan tunggu balasan dengan id yang sama. */
export function request<T extends CommandType>(
  cmd: Command & { type: T },
): Promise<CommandResult<T>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(
      `ws://127.0.0.1:${endpoint.port}/ws?token=${encodeURIComponent(endpoint.token)}`,
    );
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
