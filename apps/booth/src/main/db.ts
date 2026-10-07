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

import type { AssetKindName } from "@tetra/shared";

export type AssetKind = AssetKindName;

/** Urutan upload TSD §4.2: strip_web & thumb strip → original → sisanya. */
export const UPLOAD_PRIORITY: Record<AssetKind, number> = {
  strip_web: 0,
  thumb_strip: 0,
  original: 1,
  strip: 2,
  thumb_original: 2,
  animation: 2,
  video: 3,
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DueUpload = {
  assetId: string;
  attempts: number;
  sessionId: string;
  kind: AssetKind;
  idx: number;
  path: string;
  bytes: number;
  syncedMeta: number;
};
export type SessionMeta = {
  id: string;
  eventId: string;
  startedAt: string;
  completedAt: string;
  photoCount: number;
  retakeCount: number;
  printCount: number;
  assetCount: number;
  isTest?: boolean;
  /** Photo Stage (#178). */
  source?: "stage";
  groupName?: string | null;
};
/** Rekap booth (#154): sesi asli (bukan tes) yang selesai di laptop ini. */
export type LocalRecap = {
  sessions: number;
  prints: number;
  tests: number;
  firstAt: string | null;
  lastAt: string | null;
};
/** File hasil sesi untuk folder event (#155). */
export type EventFile = {
  sessionId: string;
  startedAt: string;
  kind: AssetKind;
  idx: number;
  path: string;
};

export type SessionStart = {
  id: string;
  eventId: string;
  layoutVersionId: string;
  startedAt: string;
  /** Photobox: pembayaran paket yang lunas (DECISIONS #70). */
  paymentId?: string | undefined;
  /** Sesi mode "Tes dulu" crew (#153). */
  isTest?: boolean | undefined;
  /** Photo Stage (#178): sesi = rombongan fotografer pelaminan. */
  source?: "stage" | undefined;
  groupName?: string | null | undefined;
};
export type SessionDone = {
  id: string;
  completedAt: string;
  photoCount: number;
  retakeCount: number;
  printCount: number;
  assets: { kind: AssetKind; idx: number; path: string; bytes: number }[];
};
/** Job cetak ulang galeri = `<sesi>-g<waktu>`; job gagal tidak dihitung (crew mencetak ulang dari menunya). */
const REPRINTED = `(select coalesce(sum(copies), 0) from print_jobs p
  where p.session_id = sessions.id and p.id like sessions.id || '-g%' and p.status != 'failed')`;
export type GallerySession = {
  id: string;
  completedAt: string;
  layoutId: string;
  printCount: number;
  reprinted: number;
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
  // Kolom baru di database lama (tambah saja, tidak pernah ubah/hapus).
  const cols = new Set(
    (db.prepare("pragma table_info(sessions)").all() as { name: string }[]).map((c) => c.name),
  );
  if (!cols.has("is_test"))
    db.exec("alter table sessions add column is_test int not null default 0");
  if (!cols.has("source")) db.exec("alter table sessions add column source text");
  if (!cols.has("group_name")) db.exec("alter table sessions add column group_name text");
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
    `insert into sessions (id, event_id, layout_version_id, payment_id, status, started_at, photo_count, retake_count, print_count, is_test, source, group_name)
     values (?, ?, ?, ?, 'in_progress', ?, 0, 0, 0, ?, ?, ?)
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
  // print_jobs: status final (done/failed/reprinted) tidak pernah kembali ke queued (M-012).
  // Baris ditulis SEBELUM print.submit dikirim (write-ahead), jadi event hasil tidak pernah mendahului barisnya.
  const insertPrint = db.prepare(
    `insert into print_jobs (id, session_id, path, copies, paper, status, attempts, error, created_at)
     values (?, ?, ?, ?, ?, 'queued', 1, null, ?)
     on conflict (id) do update set attempts = attempts + 1
       where print_jobs.status = 'queued'`,
  );
  const noteQueued = db.prepare(
    "update print_jobs set error = ? where id = ? and status = 'queued'",
  );
  const updatePrint = db.prepare(
    "update print_jobs set status = ?, error = ? where id = ? and status = 'queued' returning copies",
  );
  const markReprinted = db.prepare(
    "update print_jobs set status = 'reprinted' where id = ? and status = 'failed'",
  );
  const expire = db.prepare(
    `update print_jobs set status = 'failed', error = ?
     where status = 'queued' and (created_at < ? or attempts >= ?)`,
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
      insertStart.run(
        s.id,
        s.eventId,
        s.layoutVersionId,
        s.paymentId ?? null,
        s.startedAt,
        s.isTest ? 1 : 0,
        s.source ?? null,
        s.groupName ?? null,
      );
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
        // Hanya event cloud (id UUID, DECISIONS #58) yang bisa diunggah; event lokal tetap di laptop.
        const { event_id } = db.prepare("select event_id from sessions where id = ?").get(s.id) as {
          event_id: string;
        };
        const cloud = UUID.test(event_id);
        for (const a of s.assets) {
          const assetId = `${s.id}:${a.kind}:${a.idx}`;
          insertAsset.run(assetId, s.id, a.kind, a.idx, a.path, a.bytes);
          if (cloud) enqueue.run(assetId, UPLOAD_PRIORITY[a.kind], s.completedAt);
        }
      });
    },

    /**
     * Catat job sebelum dikirim ke Camera Service. Baru → queued. Masih queued → percobaan +1 (kirim ulang).
     * Sudah final → tidak berubah dan dikembalikan false: jangan kirim lagi.
     */
    printSubmitting(j: Omit<PrintJobRow, "status" | "error">): boolean {
      insertPrint.run(j.id, j.sessionId, j.path, j.copies, j.paper, new Date().toISOString());
      return (
        (db.prepare("select status from print_jobs where id = ?").get(j.id) as { status: string })
          .status === "queued"
      );
    },

    /** Catatan pada job yang masih queued (mis. menunggu Camera Service). */
    printNote(id: string, note: string) {
      noteQueued.run(note, id);
    },

    /**
     * Hasil akhir (event print.done/print.failed, atau submit ditolak). Hanya dari queued: hasil yang datang
     * belakangan tidak menimpa status final. Selesai → counter kertas berkurang sebanyak salinan (FSD §1.10).
     */
    printJobResult(id: string, status: "done" | "failed", error?: string) {
      const row = updatePrint.get(status, error ?? null, id) as { copies: number } | undefined;
      if (status === "done" && row) {
        const p = paper();
        kv.set("paper_remaining", String(Math.max(0, p.remaining - row.copies)));
      }
    },

    /** Crew mencetak ulang job gagal (job baru dengan id lain). */
    printReprinted(id: string) {
      markReprinted.run(id);
    },

    /** Job queued yang terlalu lama/terlalu sering dicoba → gagal, supaya muncul di menu crew. */
    printExpire(before: string, maxAttempts: number) {
      return Number(
        expire.run(`tidak terkirim setelah ${maxAttempts} percobaan`, before, maxAttempts).changes,
      );
    },

    /** Job yang sudah diserahkan tapi belum ada hasil (untuk menunggu sebelum app ditutup). */
    printsInFlight(since: string): number {
      return (
        db
          .prepare("select count(*) n from print_jobs where status = 'queued' and created_at >= ?")
          .get(since) as {
          n: number;
        }
      ).n;
    },

    kv,
    paper,
    resetPaper(capacity: number) {
      kv.set("paper_capacity", String(capacity));
      kv.set("paper_remaining", String(capacity));
    },

    /** Jumlah cetak gagal yang belum dicetak ulang (heartbeat). */
    failedPrintCount(): number {
      return (
        db.prepare("select count(*) n from print_jobs where status = 'failed'").get() as {
          n: number;
        }
      ).n;
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
    /** Job queued dalam jendela waktu, percobaan < batas, dan dibuat sebelum `before` (instance Camera Service saat ini). */
    pendingPrints(since: string, maxAttempts: number, before = "9999"): PrintJobInfo[] {
      return db
        .prepare(
          "select id, session_id, path, copies, paper, error, created_at from print_jobs where status = 'queued' and created_at >= ? and created_at < ? and attempts < ? order by created_at",
        )
        .all(since, before, maxAttempts) as PrintJobInfo[];
    },
    printStatus(id: string): string | undefined {
      return (
        db.prepare("select status from print_jobs where id = ?").get(id) as
          | { status: string }
          | undefined
      )?.status;
    },
    completedSessions(): number {
      return (
        db.prepare("select count(*) n from sessions where status = 'completed'").get() as {
          n: number;
        }
      ).n;
    },
    uploadPending(): number {
      return (db.prepare("select count(*) n from upload_queue").get() as { n: number }).n;
    },
    /** Aset yang jatuh tempo diunggah, urut prioritas TSD §4.2. */
    dueUploads(now: string, limit: number): DueUpload[] {
      return db
        .prepare(
          `select q.asset_id assetId, q.attempts, a.session_id sessionId, a.kind, a.idx, a.path, a.bytes,
             s.synced_meta syncedMeta
           from upload_queue q join assets a on a.id = q.asset_id join sessions s on s.id = a.session_id
           where q.next_attempt_at <= ? order by q.priority, q.next_attempt_at limit ?`,
        )
        .all(now, limit) as DueUpload[];
    },
    /** Metadata sesi untuk upsert cloud (POST /api/booth/sessions). */
    sessionMeta(id: string): SessionMeta & { paymentId?: string } {
      const { paymentId, isTest, source, groupName, ...m } = db
        .prepare(
          `select id, event_id eventId, started_at startedAt, completed_at completedAt,
             photo_count photoCount, retake_count retakeCount, print_count printCount,
             (select count(*) from assets where session_id = sessions.id) assetCount,
             payment_id paymentId, is_test isTest, source, group_name groupName
           from sessions where id = ?`,
        )
        .get(id) as Omit<SessionMeta, "isTest" | "source" | "groupName"> & {
        paymentId: string | null;
        isTest: number;
        source: string | null;
        groupName: string | null;
      };
      return {
        ...m,
        ...(paymentId && { paymentId }),
        ...(isTest && { isTest: true }),
        ...(source === "stage" && { source: "stage" as const, groupName }),
      };
    },
    /** Photo Stage (#178): ganti nama grup; metadata dikirim ulang ke cloud (dueMeta). */
    sessionRename(id: string, groupName: string | null) {
      db.prepare(
        "update sessions set group_name = ?, synced_meta = 0 where id = ? and source = 'stage'",
      ).run(groupName, id);
    },
    /**
     * Sesi selesai di event cloud yang metadatanya belum terkirim padahal tidak ada aset yang antre (mis. nama grup
     * diganti setelah semua foto terunggah). Sesi yang masih punya antrean ikut terkirim bersama asetnya.
     */
    dueMeta(limit: number): string[] {
      return (
        db
          .prepare(
            `select id from sessions s where status = 'completed' and synced_meta = 0
               and not exists (select 1 from assets a join upload_queue q on q.asset_id = a.id where a.session_id = s.id)
             limit ?`,
          )
          .all(limit) as { id: string }[]
      )
        .map((r) => r.id)
        .filter((id) => {
          const ev = (
            db.prepare("select event_id from sessions where id = ?").get(id) as { event_id: string }
          ).event_id;
          return UUID.test(ev);
        });
    },
    sessionMetaSynced(id: string) {
      db.prepare("update sessions set synced_meta = 1 where id = ?").run(id);
    },
    uploadDone(assetId: string, r2Key: string, at: string) {
      tx(() => {
        db.prepare("update assets set r2_key = ?, uploaded_at = ? where id = ?").run(
          r2Key,
          at,
          assetId,
        );
        db.prepare("delete from upload_queue where asset_id = ?").run(assetId);
      });
    },
    uploadFailed(assetId: string, error: string, nextAt: string) {
      db.prepare(
        "update upload_queue set attempts = attempts + 1, last_error = ?, next_attempt_at = ? where asset_id = ?",
      ).run(error, nextAt, assetId);
    },
    /** Status antrean untuk mode crew: jumlah & error terakhir. */
    uploadError(): string | null {
      return (
        (
          db
            .prepare(
              "select last_error e from upload_queue where last_error is not null order by next_attempt_at desc limit 1",
            )
            .get() as { e: string } | undefined
        )?.e ?? null
      );
    },
    /** "Coba sekarang" (FSD §1.3): semua aset yang menunggu backoff jatuh tempo sekarang. */
    uploadRetryNow(now: string) {
      db.prepare("update upload_queue set next_attempt_at = ?").run(now);
    },

    /** Sesi selesai event cloud yang punya strip_web, urut per event ("Tajamkan foto lama", #140). */
    webSessions(): { id: string; eventId: string }[] {
      return (
        db
          .prepare(
            `select s.id, s.event_id eventId from sessions s
             where s.status = 'completed'
               and exists (select 1 from assets a where a.session_id = s.id and a.kind = 'strip_web')
             order by s.event_id, s.completed_at`,
          )
          .all() as { id: string; eventId: string }[]
      ).filter((s) => UUID.test(s.eventId));
    },
    /**
     * Sesi selesai satu event, terbaru dulu (layar awal #143, galeri tamu #145). Halaman berikut: `before` =
     * completedAt kartu terakhir (keyset). `reprinted` = lembar yang sudah dicetak lagi dari galeri.
     */
    recentSessions(eventId: string, limit: number, before = "9999"): GallerySession[] {
      return (
        db
          .prepare(
            `select id, completed_at completedAt, layout_version_id layoutVersionId, print_count printCount,
               ${REPRINTED} reprinted
             from sessions where event_id = ? and status = 'completed' and is_test = 0 and completed_at < ?
             order by completed_at desc limit ?`,
          )
          .all(eventId, before, limit) as (GallerySession & { layoutVersionId: string })[]
      ).map(({ layoutVersionId, ...s }) => ({
        ...s,
        layoutId: layoutVersionId.slice(0, layoutVersionId.lastIndexOf("@")),
      }));
    },
    /**
     * Jumlah sesi selesai per jam (UTC "YYYY-MM-DDTHH"), terbaru dulu, untuk chip jam galeri (#145).
     * ponytail: jam UTC = jam lokal hanya untuk zona offset jam penuh (WIB/WITA/WIT); ubah kalau booth di zona :30.
     */
    sessionHours(eventId: string): { hour: string; n: number }[] {
      return db
        .prepare(
          `select substr(completed_at, 1, 13) hour, count(*) n from sessions
           where event_id = ? and status = 'completed' and is_test = 0 group by hour order by hour desc`,
        )
        .all(eventId) as { hour: string; n: number }[];
    },
    /** Rekap booth (#154): sesi asli selesai event ini (print_count sudah termasuk cetak ulang galeri). */
    recap(eventId: string): LocalRecap {
      return db
        .prepare(
          `select coalesce(sum(is_test = 0), 0) sessions,
             coalesce(sum(case when is_test = 0 then print_count end), 0) prints,
             coalesce(sum(is_test), 0) tests,
             min(case when is_test = 0 then started_at end) firstAt,
             max(case when is_test = 0 then started_at end) lastAt
           from sessions where event_id = ? and status = 'completed'`,
        )
        .get(eventId) as LocalRecap;
    },
    /** Jam mulai sesi asli event ini (sesi di luar waktu acara di rekap, #170). */
    sessionTimes(eventId: string): string[] {
      return (
        db
          .prepare(
            `select started_at t from sessions
             where event_id = ? and status = 'completed' and is_test = 0`,
          )
          .all(eventId) as { t: string }[]
      ).map((r) => r.t);
    },
    /** File hasil sesi asli event ini (lembar cetak, foto asli, GIF, video) untuk folder event (#155). */
    eventFiles(eventId: string): EventFile[] {
      return db
        .prepare(
          `select a.session_id sessionId, s.started_at startedAt, a.kind, a.idx, a.path
           from assets a join sessions s on s.id = a.session_id
           where s.event_id = ? and s.status = 'completed' and s.is_test = 0
             and a.kind in ('strip', 'original', 'animation', 'video')
           order by s.started_at, a.kind, a.idx`,
        )
        .all(eventId) as EventFile[];
    },
    /** Lembar cetak ulang dari galeri untuk sesi selesai ini; undefined = sesi tidak ada / belum selesai. */
    reprinted(sessionId: string): number | undefined {
      return (
        db
          .prepare(`select ${REPRINTED} n from sessions where id = ? and status = 'completed'`)
          .get(sessionId) as { n: number } | undefined
      )?.n;
    },
    /** Cetak ulang dari galeri menambah print_count sesi (#145). */
    addPrints(sessionId: string, copies: number) {
      db.prepare("update sessions set print_count = print_count + ? where id = ?").run(
        copies,
        sessionId,
      );
    },
    /**
     * Aset yang ditulis ulang (#140): ukuran baru, belum terunggah, masuk antrean lagi. Kunci R2 & baris aset cloud
     * sama (sesi/kind/idx), jadi unggahan ulang menimpa objek lama (idempotent).
     */
    reupload(
      sessionId: string,
      assets: { kind: AssetKind; idx: number; path: string; bytes: number }[],
      now: string,
    ) {
      tx(() => {
        for (const a of assets) {
          const id = `${sessionId}:${a.kind}:${a.idx}`;
          db.prepare(
            `insert into assets (id, session_id, kind, idx, path, bytes) values (?, ?, ?, ?, ?, ?)
             on conflict (id) do update set path = excluded.path, bytes = excluded.bytes, r2_key = null, uploaded_at = null`,
          ).run(id, sessionId, a.kind, a.idx, a.path, a.bytes);
          db.prepare(
            `insert into upload_queue (asset_id, priority, next_attempt_at) values (?, ?, ?)
             on conflict (asset_id) do update set attempts = 0, last_error = null, next_attempt_at = excluded.next_attempt_at`,
          ).run(id, UPLOAD_PRIORITY[a.kind], now);
        }
      });
    },

    /** Untuk test & mode crew nanti. */
    query<T>(sql: string, ...params: (string | number | null)[]): T[] {
      return db.prepare(sql).all(...params) as T[];
    },

    close: () => db.close(),
  };
}

export type BoothDb = ReturnType<typeof openDb>;
