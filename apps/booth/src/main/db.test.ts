import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { pruneLogs } from "./log";

const tmp = () => mkdtempSync(join(tmpdir(), "tb-"));
const start = {
  id: "abcdefghjk",
  eventId: "e1",
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

  it("idempotent: dipanggil ulang tidak menggandakan aset/antrean", () => {
    const db = openDb(":memory:");
    db.sessionStarted(start);
    db.sessionStarted(start);
    db.sessionCompleted(done);
    db.sessionCompleted(done);
    expect(db.query<{ n: number }>("select count(*) n from assets")[0]?.n).toBe(4);
    expect(db.query<{ n: number }>("select count(*) n from upload_queue")[0]?.n).toBe(4);
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
