import { DatabaseSync } from "node:sqlite";

/**
 * SQLite lokal booth (06-DATA-MODEL §3) memakai `node:sqlite` bawaan Electron (DECISIONS #31).
 * Mode WAL: tahan crash, tulis tidak memblokir baca.
 */

const SCHEMA = `
create table if not exists kv (key text primary key, value text);
create table if not exists events_cache (
  id text primary key, bundle_version int, config json, synced_at text
);
create table if not exists sessions (
  id text primary key, event_id text, layout_version_id text,
  payment_id text, status text,
  started_at text, completed_at text,
  photo_count int, retake_count int, print_count int,
  synced_meta int default 0
);
create table if not exists assets (
  id text primary key, session_id text, kind text, idx int,
  path text, r2_key text, bytes int, uploaded_at text
);
create table if not exists upload_queue (
  asset_id text primary key, priority int, attempts int default 0,
  next_attempt_at text, last_error text
);
create table if not exists print_jobs (
  id text primary key, session_id text, path text, copies int,
  paper text, status text, attempts int default 0, error text, created_at text
);
`;

export type AssetKind = "strip" | "strip_web" | "original" | "thumb_strip" | "thumb_original";

/** Urutan upload TSD §4.2: strip_web & thumb strip → original → sisanya. */
export const UPLOAD_PRIORITY: Record<AssetKind, number> = {
  strip_web: 0,
  thumb_strip: 0,
  original: 1,
  strip: 2,
  thumb_original: 2,
};

export type SessionStart = {
  id: string;
  eventId: string;
  layoutVersionId: string;
  startedAt: string;
};
export type SessionDone = {
  id: string;
  completedAt: string;
  photoCount: number;
  retakeCount: number;
  printCount: number;
  assets: { kind: AssetKind; idx: number; path: string; bytes: number }[];
};
export type PrintJobStatus = "queued" | "done" | "failed" | "reprinted";
export type PrintJobInfo = {
  id: string;
  session_id: string;
  path: string;
  copies: number;
  paper: string;
  error: string | null;
  created_at: string;
};

/** Kapasitas default satu roll DNP RX1HS 4×6 (lembar). */
export const DEFAULT_PAPER_CAPACITY = 700;
export type PrintJobRow = {
  id: string;
  sessionId: string;
  path: string;
  copies: number;
  paper: string;
  status: PrintJobStatus;
  error?: string | undefined;
};

export function openDb(file: string) {
  const db = new DatabaseSync(file);
  db.exec("pragma journal_mode = wal; pragma synchronous = normal; pragma foreign_keys = on;");
  db.exec(SCHEMA);
  // Sesi yang masih berjalan saat app mati tidak akan pernah selesai.
  const abandoned = db
    .prepare("update sessions set status = 'abandoned' where status = 'in_progress'")
    .run().changes;

  const tx = <T>(fn: () => T): T => {
    db.exec("begin");
    try {
      const r = fn();
      db.exec("commit");
      return r;
    } catch (e) {
      db.exec("rollback");
      throw e;
    }
  };

  const insertStart = db.prepare(
    `insert into sessions (id, event_id, layout_version_id, status, started_at, photo_count, retake_count, print_count)
     values (?, ?, ?, 'in_progress', ?, 0, 0, 0)
     on conflict (id) do nothing`,
  );
  const complete = db.prepare(
    `update sessions set status = 'completed', completed_at = ?, photo_count = ?, retake_count = ?, print_count = ?
     where id = ?`,
  );
  const insertAsset = db.prepare(
    `insert into assets (id, session_id, kind, idx, path, bytes) values (?, ?, ?, ?, ?, ?)
     on conflict (id) do nothing`,
  );
  const enqueue = db.prepare(
    `insert into upload_queue (asset_id, priority, next_attempt_at) values (?, ?, ?)
     on conflict (asset_id) do nothing`,
  );
  const insertPrint = db.prepare(
    `insert into print_jobs (id, session_id, path, copies, paper, status, attempts, error, created_at)
     values (?, ?, ?, ?, ?, ?, 1, ?, ?)
     on conflict (id) do update set status = excluded.status, attempts = attempts + 1, error = excluded.error`,
  );

  const updatePrint = db.prepare(
    "update print_jobs set status = ?, error = ? where id = ? returning copies",
  );
  const getKv = db.prepare("select value from kv where key = ?");
  const setKv = db.prepare(
    "insert into kv (key, value) values (?, ?) on conflict (key) do update set value = excluded.value",
  );
  const kv = {
    get: (k: string): string | null =>
      (getKv.get(k) as { value: string } | undefined)?.value ?? null,
    set: (k: string, v: string) => void setKv.run(k, v),
  };
  const paper = () => ({
    remaining: Number(kv.get("paper_remaining") ?? DEFAULT_PAPER_CAPACITY),
    capacity: Number(kv.get("paper_capacity") ?? DEFAULT_PAPER_CAPACITY),
  });

  return {
    abandoned: Number(abandoned),

    sessionStarted(s: SessionStart) {
      insertStart.run(s.id, s.eventId, s.layoutVersionId, s.startedAt);
    },

    /** Sesi + aset + antrean upload dalam satu transaksi (TSD §4.2 langkah 1). Idempotent per aset (id = sesi:kind:idx). */
    sessionCompleted(s: SessionDone) {
      tx(() => {
        const changed = complete.run(
          s.completedAt,
          s.photoCount,
          s.retakeCount,
          s.printCount,
          s.id,
        ).changes;
        if (!changed) throw new Error(`sesi ${s.id} belum tercatat`);
        for (const a of s.assets) {
          const assetId = `${s.id}:${a.kind}:${a.idx}`;
          insertAsset.run(assetId, s.id, a.kind, a.idx, a.path, a.bytes);
          enqueue.run(assetId, UPLOAD_PRIORITY[a.kind], s.completedAt);
        }
      });
    },

    printJob(j: PrintJobRow) {
      insertPrint.run(
        j.id,
        j.sessionId,
        j.path,
        j.copies,
        j.paper,
        j.status,
        j.error ?? null,
        new Date().toISOString(),
      );
    },

    /** Hasil akhir dari event Camera Service (print.done / print.failed). */
    /** Hasil akhir cetak. Selesai → counter kertas berkurang sebanyak salinan (FSD §1.10). */
    printJobResult(id: string, status: PrintJobStatus, error?: string) {
      const row = updatePrint.get(status, error ?? null, id) as { copies: number } | undefined;
      if (status === "done" && row) {
        const p = paper();
        kv.set("paper_remaining", String(Math.max(0, p.remaining - row.copies)));
      }
    },

    kv,
    paper,
    resetPaper(capacity: number) {
      kv.set("paper_capacity", String(capacity));
      kv.set("paper_remaining", String(capacity));
    },

    /** Cetak gagal yang belum dicetak ulang, terbaru dulu. */
    failedPrints(): PrintJobInfo[] {
      return db
        .prepare(
          "select id, session_id, path, copies, paper, error, created_at from print_jobs where status = 'failed' order by created_at desc limit 20",
        )
        .all() as PrintJobInfo[];
    },
    printJobById(id: string): PrintJobInfo | undefined {
      return db
        .prepare(
          "select id, session_id, path, copies, paper, error, created_at from print_jobs where id = ?",
        )
        .get(id) as PrintJobInfo | undefined;
    },
    /** Print yang diterima/tertunda tapi belum ada hasil, cukup baru untuk dikirim ulang setelah Camera Service pulih. */
    pendingPrints(since: string, maxAttempts: number): PrintJobInfo[] {
      return db
        .prepare(
          "select id, session_id, path, copies, paper, error, created_at from print_jobs where status = 'queued' and created_at >= ? and attempts < ? order by created_at",
        )
        .all(since, maxAttempts) as PrintJobInfo[];
    },
    uploadPending(): number {
      return (db.prepare("select count(*) n from upload_queue").get() as { n: number }).n;
    },

    /** Untuk test & mode crew nanti. */
    query<T>(sql: string, ...params: (string | number | null)[]): T[] {
      return db.prepare(sql).all(...params) as T[];
    },

    close: () => db.close(),
  };
}

export type BoothDb = ReturnType<typeof openDb>;
