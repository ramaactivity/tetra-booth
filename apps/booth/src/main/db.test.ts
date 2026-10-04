import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { pruneLogs } from "./log";

const tmp = () => mkdtempSync(join(tmpdir(), "tb-"));
const start = {
  id: "abcdefghjk",
  eventId: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  layoutVersionId: "l@1",
  startedAt: "2026-09-24T10:00:00Z",
};
const done = {
  id: "abcdefghjk",
  completedAt: "2026-09-24T10:01:00Z",
  photoCount: 3,
  retakeCount: 1,
  printCount: 2,
  assets: [
    { kind: "strip" as const, idx: 0, path: "/s/out/strip.jpg", bytes: 10 },
    { kind: "strip_web" as const, idx: 0, path: "/s/out/strip_web.jpg", bytes: 5 },
    { kind: "original" as const, idx: 1, path: "/s/out/original_1.jpg", bytes: 7 },
    { kind: "thumb_original" as const, idx: 1, path: "/s/out/thumb_original_1.jpg", bytes: 1 },
  ],
};

describe("booth db", () => {
  it("sesi selesai: sesi, aset, dan antrean upload dalam satu transaksi dengan prioritas TSD §4.2", () => {
    const db = openDb(":memory:");
    db.sessionStarted(start);
    db.sessionCompleted(done);
    expect(db.query("select status, photo_count, retake_count, print_count from sessions")).toEqual(
      [{ status: "completed", photo_count: 3, retake_count: 1, print_count: 2 }],
    );
    const q = db.query<{ kind: string; priority: number }>(
      "select a.kind, q.priority from upload_queue q join assets a on a.id = q.asset_id order by q.priority, a.kind",
    );
    expect(q.map((r) => `${r.priority}:${r.kind}`)).toEqual([
      "0:strip_web",
      "1:original",
      "2:strip",
      "2:thumb_original",
    ]);
  });

  it("layar awal (#143): hanya sesi selesai event itu, terbaru dulu", () => {
    const db = openDb(":memory:");
    db.sessionStarted(start);
    db.sessionCompleted(done);
    db.sessionStarted({ ...start, id: "baru000001" });
    db.sessionCompleted({ ...done, id: "baru000001", completedAt: "2026-09-24T11:00:00Z" });
    db.sessionStarted({ ...start, id: "batal00001" });
    db.sessionStarted({ ...start, id: "lain000001", eventId: "local" });
    db.sessionCompleted({ ...done, id: "lain000001" });
    const ids = (r: { id: string }[]) => r.map((x) => x.id);
    expect(ids(db.recentSessions(start.eventId, 10))).toEqual(["baru000001", start.id]);
    expect(ids(db.recentSessions(start.eventId, 1))).toEqual(["baru000001"]);
    // Galeri (#145): halaman berikut lewat kursor completedAt; jam UTC + jumlah untuk chip.
    expect(db.recentSessions(start.eventId, 1, "2026-09-24T11:00:00Z")).toEqual([
      {
        id: start.id,
        completedAt: done.completedAt,
        layoutId: "l",
        printCount: 2,
        reprinted: 0,
      },
    ]);
    expect(db.sessionHours(start.eventId)).toEqual([
      { hour: "2026-09-24T11", n: 1 },
      { hour: "2026-09-24T10", n: 1 },
    ]);
  });

  it("galeri cetak lagi (#145): hanya job -g yang tidak gagal dihitung, print_count bertambah", () => {
    const db = openDb(":memory:");
    db.sessionStarted(start);
    expect(db.reprinted(start.id)).toBeUndefined();
    db.sessionCompleted(done);
    const job = { sessionId: start.id, path: "/s/out/strip.jpg", paper: "4R" };
    db.printSubmitting({ ...job, id: start.id, copies: 2 });
    db.printSubmitting({ ...job, id: `${start.id}-g1`, copies: 1 });
    db.printSubmitting({ ...job, id: `${start.id}-g2`, copies: 1 });
    db.printJobResult(`${start.id}-g2`, "failed", "x");
    db.printSubmitting({ ...job, id: `${start.id}-r1`, copies: 1 });
    expect(db.reprinted(start.id)).toBe(1);
    db.addPrints(start.id, 1);
    expect(db.recentSessions(start.eventId, 1)[0]).toMatchObject({ printCount: 3, reprinted: 1 });
  });

  it("tajamkan foto lama (#140): strip_web terunggah masuk antrean lagi dengan ukuran baru, tanpa baris ganda", () => {
    const db = openDb(":memory:");
    db.sessionStarted(start);
    db.sessionCompleted(done);
    db.sessionStarted({ ...start, id: "lokalsesi1", eventId: "local" });
    db.sessionCompleted({ ...done, id: "lokalsesi1" });
    expect(db.webSessions()).toEqual([{ id: start.id, eventId: start.eventId }]);
    const id = `${start.id}:strip_web:0`;
    db.uploadDone(id, "k", "2026-09-24T10:02:00Z");
    db.uploadFailed(`${start.id}:strip:0`, "x", "2026-09-24T10:03:00Z");
    const assets = [
      { kind: "strip_web" as const, idx: 0, path: "/s/out/strip_web.jpg", bytes: 50 },
      { kind: "thumb_strip" as const, idx: 0, path: "/s/out/thumb_strip.jpg", bytes: 9 },
    ];
    db.reupload(start.id, assets, "2026-10-01T00:00:00Z");
    db.reupload(start.id, assets, "2026-10-01T00:00:00Z");
    expect(
      db.query(
        "select kind, bytes, r2_key from assets where session_id = ? and kind in ('strip_web', 'thumb_strip') order by kind",
        start.id,
      ),
    ).toEqual([
      { kind: "strip_web", bytes: 50, r2_key: null },
      { kind: "thumb_strip", bytes: 9, r2_key: null },
    ]);
    expect(db.dueUploads("2026-10-01T00:00:00Z", 2).map((u) => u.kind)).toEqual([
      "strip_web",
      "thumb_strip",
    ]);
  });

  it("idempotent: dipanggil ulang tidak menggandakan aset/antrean", () => {
    const db = openDb(":memory:");
    db.sessionStarted(start);
    db.sessionStarted(start);
    db.sessionCompleted(done);
    db.sessionCompleted(done);
    expect(db.query<{ n: number }>("select count(*) n from assets")[0]?.n).toBe(4);
    expect(db.query<{ n: number }>("select count(*) n from upload_queue")[0]?.n).toBe(4);
  });

  it("event lokal (bukan UUID cloud): aset tersimpan, tidak masuk antrean upload", () => {
    const db = openDb(":memory:");
    db.sessionStarted({ ...start, eventId: "andi-sari" });
    db.sessionCompleted(done);
    expect(db.query<{ n: number }>("select count(*) n from assets")[0]?.n).toBe(4);
    expect(db.uploadPending()).toBe(0);
  });

  it("antrean upload: jatuh tempo urut prioritas, gagal → backoff, selesai → keluar antrean", () => {
    const db = openDb(":memory:");
    db.sessionStarted(start);
    db.sessionCompleted(done);
    const now = "2026-09-24T10:02:00Z";
    expect(db.dueUploads(now, 2).map((u) => u.kind)).toEqual(["strip_web", "original"]);
    expect(db.sessionMeta(start.id)).toMatchObject({ eventId: start.eventId, assetCount: 4 });
    db.uploadFailed(`${start.id}:strip_web:0`, "offline", "2026-09-24T10:03:00Z");
    expect(db.dueUploads(now, 1).map((u) => u.kind)).toEqual(["original"]);
    expect(db.uploadError()).toBe("offline");
    db.uploadDone(`${start.id}:original:1`, "k", now);
    expect(db.uploadPending()).toBe(3);
    db.uploadRetryNow(now);
    expect(db.dueUploads(now, 1)[0]).toMatchObject({ kind: "strip_web", attempts: 1 });
  });

  it("gagal di tengah transaksi → tidak ada yang tertulis", () => {
    const db = openDb(":memory:");
    expect(() => db.sessionCompleted(done)).toThrow(/belum tercatat/);
    expect(db.query<{ n: number }>("select count(*) n from assets")[0]?.n).toBe(0);
  });

  it("sesi in_progress saat app mati ditandai abandoned saat dibuka lagi", () => {
    const file = join(tmp(), "db.sqlite");
    const a = openDb(file);
    a.sessionStarted(start);
    a.close();
    const b = openDb(file);
    expect(b.abandoned).toBe(1);
    expect(b.query("select status from sessions")).toEqual([{ status: "abandoned" }]);
  });
});

const job = (id: string) => ({ id, sessionId: id, path: "/p", copies: 1, paper: "2x6x2" });
const status = (db: ReturnType<typeof openDb>, id: string) =>
  db.query<{ status: string; attempts: number; error: string | null }>(
    "select status, attempts, error from print_jobs where id = ?",
    id,
  )[0];

describe("status print_jobs (M-009, M-012)", () => {
  it("write-ahead: queued sebelum dikirim; kirim ulang menaikkan percobaan", () => {
    const db = openDb(":memory:");
    expect(db.printSubmitting(job("a"))).toBe(true);
    expect(db.printSubmitting(job("a"))).toBe(true);
    expect(status(db, "a")).toEqual({ status: "queued", attempts: 2, error: null });
  });

  it("status final tidak pernah kembali ke queued (print_uncertain tidak tertimpa kirim ulang)", () => {
    const db = openDb(":memory:");
    db.printSubmitting(job("u"));
    db.printJobResult("u", "failed", "print_uncertain: mungkin sudah tercetak");
    expect(db.printSubmitting(job("u"))).toBe(false); // pengiriman ulang otomatis ditolak
    db.printNote("u", "menunggu Camera Service");
    expect(status(db, "u")).toEqual({
      status: "failed",
      attempts: 1,
      error: "print_uncertain: mungkin sudah tercetak",
    });
    expect(db.failedPrints().map((j) => j.id)).toEqual(["u"]);
  });

  it("hasil yang datang belakangan tidak menimpa hasil pertama", () => {
    const db = openDb(":memory:");
    db.printSubmitting(job("d"));
    db.printJobResult("d", "done");
    db.printJobResult("d", "failed", "terlambat");
    expect(status(db, "d")?.status).toBe("done");
  });

  it("hanya queued, dalam jendela waktu, percobaan < batas yang dikirim ulang; sisanya kedaluwarsa jadi gagal", () => {
    const db = openDb(":memory:");
    db.printSubmitting(job("baru"));
    db.printSubmitting(job("selesai"));
    db.printJobResult("selesai", "done");
    for (let i = 0; i < 3; i++) db.printSubmitting(job("capek"));
    const since = new Date(Date.now() - 60_000).toISOString();
    expect(db.pendingPrints(since, 3).map((j) => j.id)).toEqual(["baru"]);
    // Job yang dibuat setelah Camera Service start tidak dikirim ulang (M-015).
    expect(db.pendingPrints(since, 3, new Date(Date.now() - 30_000).toISOString())).toEqual([]);
    expect(db.printExpire(since, 3)).toBe(1);
    expect(status(db, "capek")).toMatchObject({
      status: "failed",
      error: "tidak terkirim setelah 3 percobaan",
    });
    expect(db.printsInFlight(since)).toBe(1);
  });
});

describe("log harian", () => {
  it("hapus log lebih tua dari 14 hari, sisakan yang baru dan file lain", () => {
    const dir = tmp();
    for (const f of ["2026-09-01.log", "2026-09-10.log", "2026-09-24.log", "catatan.txt"])
      writeFileSync(join(dir, f), "");
    expect(pruneLogs(dir, new Date("2026-09-24T12:00:00Z"))).toEqual(["2026-09-01.log"]);
    expect(readdirSync(dir).sort()).toEqual(["2026-09-10.log", "2026-09-24.log", "catatan.txt"]);
  });
});
