import { randomUUID } from "node:crypto";
import { BoothRunResponse, type RunAction, type RunState } from "@tetra/shared";

type Kv = { get(key: string): string | null | undefined; set(key: string, value: string): void };
type Item = { id: string; eventId: string; action: RunAction; at: string };
export type RunPost = (path: string, body: unknown) => Promise<{ status: number; body: unknown }>;

const QUEUE = "run_outbox";
const stateKey = (eventId: string) => `run_state:${eventId}`;

/** Perkiraan state lokal (sama dengan applyRun di server) supaya menu crew langsung berubah walau offline. */
export function nextRunState(s: RunState, a: RunAction): RunState {
  if (a === "start") return "running";
  if (a === "open") return s === "idle" || s === "paused" ? "running" : s;
  if (a === "pause") return s === "running" ? "paused" : s;
  return s === "running" || s === "paused" ? "finished" : s;
}

/**
 * Antrean timer event dari booth (DECISIONS #149): tiap aksi crew (Buka untuk Tamu, Jeda, Lanjutkan, Selesai)
 * dicatat dengan jam laptop saat ditekan + id unik, disimpan di kv (tahan restart), lalu dikirim berurutan ke
 * POST /api/booth/events/:id/run. Offline / server error = berhenti, coba lagi di putaran berikutnya (idempotent
 * lewat id). 4xx (event bukan milik booth, dll.) = dibuang.
 */
export function createRunQueue(o: {
  kv: Kv;
  post: RunPost;
  log: (m: string) => void;
  now?: () => number;
}) {
  const now = o.now ?? Date.now;
  const read = (): Item[] => {
    try {
      return JSON.parse(o.kv.get(QUEUE) ?? "[]") as Item[];
    } catch {
      return [];
    }
  };
  const write = (q: Item[]) => o.kv.set(QUEUE, JSON.stringify(q));
  const state = (eventId: string) => (o.kv.get(stateKey(eventId)) as RunState | null) ?? "idle";

  let draining: Promise<void> | null = null;
  const drain = () => {
    draining ??= (async () => {
      for (;;) {
        const item = read()[0];
        if (!item) return;
        let res: { status: number; body: unknown };
        try {
          res = await o.post(`/api/booth/events/${item.eventId}/run`, {
            id: item.id,
            action: item.action,
            at: item.at,
          });
        } catch {
          return; // offline: coba lagi nanti
        }
        if (res.status >= 500 || res.status === 429 || res.status === 401) return;
        const rest = read().filter((x) => x.id !== item.id);
        write(rest);
        if (res.status >= 400) {
          o.log(`[run] ${item.action} ${item.eventId} ditolak server ${res.status}, dibuang`);
          continue;
        }
        // Tidak ada aksi lain yang menunggu untuk event ini → ikuti state server (bisa diubah admin).
        const s = BoothRunResponse.safeParse(res.body);
        if (s.success && !rest.some((x) => x.eventId === item.eventId))
          o.kv.set(stateKey(item.eventId), s.data.state);
      }
    })().finally(() => {
      draining = null;
    });
    return draining;
  };

  return {
    state,
    pending: () => read().length,
    drain,
    /** Catat aksi (jam sekarang = jam aksi), perbarui state lokal, kirim di latar belakang. */
    push(eventId: string, action: RunAction): RunState {
      const before = state(eventId);
      const next = nextRunState(before, action);
      // "Buka untuk Tamu" yang tidak mengubah apa pun (sudah berjalan / selesai) tidak perlu dikirim.
      if (action === "open" && next === before && before !== "idle") return before;
      write([...read(), { id: randomUUID(), eventId, action, at: new Date(now()).toISOString() }]);
      o.kv.set(stateKey(eventId), next);
      void drain();
      return next;
    },
  };
}
