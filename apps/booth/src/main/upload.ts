import { readFile } from "node:fs/promises";
import { assetFile, SignResponse } from "@tetra/shared";
import type { BoothDb, DueUpload } from "./db";

/** Backoff per percobaan gagal (TSD §4.2): 5 dtk, 15 dtk, 1 mnt, lalu 5 mnt. */
export const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];
export const CONCURRENCY = 2;

export type Api = (path: string, body: unknown) => Promise<unknown>;

/**
 * Worker antrean upload (Fase 2 N4, TSD §4.2): upsert sesi → URL PUT R2 → PUT file → catat aset.
 * Konkurensi 2, urut prioritas; gagal → backoff per aset. Tidak pernah memblokir UI (jalan di main).
 */
export function createUploader(o: {
  db: BoothDb;
  api: Api;
  put: (url: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  log: (m: string) => void;
  now?: () => number;
}) {
  const now = o.now ?? Date.now;
  const iso = (ms: number) => new Date(ms).toISOString();

  const one = async (u: DueUpload) => {
    try {
      if (!u.syncedMeta) {
        await o.api("/api/booth/sessions", o.db.sessionMeta(u.sessionId));
        o.db.sessionMetaSynced(u.sessionId);
      }
      const { uploads } = SignResponse.parse(
        await o.api("/api/booth/uploads/sign", {
          sessionId: u.sessionId,
          assets: [{ kind: u.kind, idx: u.idx }],
        }),
      );
      const up = uploads[0];
      if (!up) throw new Error("server tidak memberi URL upload");
      await o.put(up.url, await readFile(u.path), assetFile(u.kind).contentType);
      await o.api(`/api/booth/sessions/${u.sessionId}/assets`, {
        assets: [{ kind: u.kind, idx: u.idx, bytes: u.bytes }],
      });
      o.db.uploadDone(u.assetId, up.key, iso(now()));
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const wait = BACKOFF_MS[Math.min(u.attempts, BACKOFF_MS.length - 1)] ?? 300_000;
      o.db.uploadFailed(u.assetId, msg, iso(now() + wait));
      o.log(`[upload] ${u.assetId} gagal (${msg}), coba lagi ${wait / 1000} dtk`);
      return false;
    }
  };

  let draining: Promise<void> | null = null;
  /** Unggah semua yang jatuh tempo, 2 sekaligus; berhenti kalau satu putaran gagal semua (mis. offline). */
  const drain = () => {
    draining ??= (async () => {
      for (;;) {
        const due = o.db.dueUploads(iso(now()), CONCURRENCY);
        if (!due.length) return;
        const ok = await Promise.all(due.map(one));
        if (!ok.some(Boolean)) return;
      }
    })().finally(() => {
      draining = null;
    });
    return draining;
  };
  return { drain };
}
