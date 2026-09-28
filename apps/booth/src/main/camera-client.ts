import { randomUUID } from "node:crypto";
import {
  type Command,
  type CommandResult,
  type CommandType,
  EventSchema,
  ReplySchema,
  ResultSchemas,
  type ServiceEvent,
} from "@tetra/shared";

// Default = Camera Service yang dijalankan manual (--no-spawn). Supervisor mengganti dengan port & token acak (TSD §1).
let endpoint = { port: 8765, token: "dev" };
export const setEndpoint = (port: number, token: string) => {
  endpoint = { port, token };
};
const TIMEOUT_MS = 3000;
/** Frame live view terbaru (Canon EDSDK, #111). */
export const liveViewUrl = () =>
  `http://127.0.0.1:${endpoint.port}/liveview.jpg?token=${encodeURIComponent(endpoint.token)}`;

/** Camera Service tidak bisa dihubungi (mati/restart/macet), berbeda dari error yang dibalas service. */
export class ServiceUnavailable extends Error {}
const LISTEN_RETRY_MS = 2000;
const url = () => `ws://127.0.0.1:${endpoint.port}/ws?token=${encodeURIComponent(endpoint.token)}`;

/** Kirim satu perintah ke Camera Service dan tunggu balasan dengan id yang sama. */
export function request<T extends CommandType>(
  cmd: Command & { type: T },
  timeoutMs = TIMEOUT_MS,
): Promise<CommandResult<T>> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url());
    const timer = setTimeout(() => {
      ws.close();
      reject(new ServiceUnavailable("Camera Service tidak menjawab"));
    }, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      ws.close();
    };
    ws.onopen = () => ws.send(JSON.stringify(cmd));
    ws.onerror = () => {
      done();
      reject(new ServiceUnavailable("Camera Service tidak terhubung"));
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

/**
 * Koneksi tetap untuk event Camera Service (print.done/print.failed/printer.status, nanti kamera).
 * Sambung ulang tiap 2 detik kalau putus (Camera Service di-restart supervisor). Kembalikan fungsi stop.
 */
export function listenEvents(onEvent: (e: ServiceEvent) => void): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const connect = () => {
    if (stopped) return;
    const s = new WebSocket(url());
    ws = s;
    s.onmessage = (e) => {
      try {
        const msg = EventSchema.safeParse(JSON.parse(String(e.data)));
        if (msg.success) onEvent(msg.data);
      } catch {
        // pesan bukan JSON: abaikan
      }
    };
    s.onclose = () => {
      if (ws === s && !stopped) timer = setTimeout(connect, LISTEN_RETRY_MS);
    };
  };
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    ws?.close();
  };
}
