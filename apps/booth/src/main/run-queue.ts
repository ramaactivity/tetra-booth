import { randomUUID } from "node:crypto";
import {
  applyRun,
  BoothRunResponse,
  EMPTY_RUN,
  type EventRun,
  type LocalStorage,
  type RunAction,
  type RunState,
} from "@tetra/shared";

type Kv = { get(key: string): string | null | undefined; set(key: string, value: string): void };
type Item = { id: string; eventId: string; action: RunAction; at: string; local?: LocalStorage };
export type RunPost = (path: string, body: unknown) => Promise<{ status: number; body: unknown }>;

const QUEUE = "run_outbox";
const stateKey = (eventId: string) => `run_state:${eventId}`;
/** "Mulai acara" ditekan, timer menunggu sesi tamu pertama (#152). */
const armedKey = (eventId: string) => `run_armed:${eventId}`;
/** Aksi yang diterapkan di laptop ini, untuk rekap booth offline (#154). */
const logKey = (eventId: string) => `run_log:${eventId}`;
/** State menurut booth: `waiting` = Mulai acara sudah ditekan, belum ada sesi tamu. */
export type BoothRunState = RunState | "waiting";

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
  const armed = (eventId: string) => o.kv.get(armedKey(eventId)) === "1";
  const readLog = (eventId: string): { action: RunAction; at: string }[] => {
    try {
      return JSON.parse(o.kv.get(logKey(eventId)) ?? "[]");
    } catch {
      return [];
    }
  };

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
            ...(item.local && { local: item.local }),
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

  /** Catat aksi (jam `at`, bawaan sekarang), perbarui state lokal, kirim di latar belakang. */
  const push = (
    eventId: string,
    action: RunAction,
    at = new Date(now()).toISOString(),
    local?: LocalStorage,
  ) => {
    const before = state(eventId);
    const next = nextRunState(before, action);
    if (action !== "open") o.kv.set(armedKey(eventId), "");
    // Aksi yang tidak mengubah apa pun (sudah berjalan / selesai / jeda dua kali) tidak perlu dikirim.
    if (next === before) return before;
    write([...read(), { id: randomUUID(), eventId, action, at, ...(local && { local }) }]);
    o.kv.set(stateKey(eventId), next);
    o.kv.set(logKey(eventId), JSON.stringify([...readLog(eventId), { action, at }].slice(-500)));
    void drain();
    return next;
  };
  const boothState = (eventId: string): BoothRunState =>
    state(eventId) === "idle" && armed(eventId) ? "waiting" : state(eventId);

  return {
    state: boothState,
    pending: () => read().length,
    drain,
    /** `local` = ukuran folder event, ikut terkirim bersama `finish` (#166). */
    push: (eventId: string, action: RunAction, local?: LocalStorage): BoothRunState => {
      push(eventId, action, undefined, local);
      return boothState(eventId);
    },
    /**
     * "Mulai acara" (#152): timer belum jalan, menunggu sesi tamu pertama. Event yang sudah pernah mulai
     * (berjalan/dijeda/selesai) tidak berubah.
     */
    arm(eventId: string): BoothRunState {
      if (state(eventId) === "idle") o.kv.set(armedKey(eventId), "1");
      return boothState(eventId);
    },
    /** Sesi tamu (bukan tes) mulai: kalau menunggu, timer mulai di jam sesi itu. */
    sessionStarted(eventId: string, at: string) {
      if (armed(eventId) && state(eventId) === "idle") push(eventId, "start", at);
    },
    /** Timer menurut laptop ini (rekap offline); bisa beda dengan cloud kalau admin mengubah dari dashboard. */
    localRun(eventId: string): EventRun {
      return readLog(eventId).reduce(
        (r, x) => applyRun(r, x.action, x.at, Date.parse(x.at)),
        EMPTY_RUN,
      );
    },
  };
}
