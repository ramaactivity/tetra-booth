import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { openDb } from "./db";
import { BACKOFF_MS, createUploader } from "./upload";

const EVENT = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), "tb-up-"));
  const db = openDb(":memory:");
  db.sessionStarted({
    id: "abcdefghjk",
    eventId: EVENT,
    layoutVersionId: "l@1",
    startedAt: "2026-09-24T10:00:00Z",
  });
  const assets = (["strip_web", "original", "strip"] as const).map((kind, i) => {
    const path = join(dir, `${kind}.jpg`);
    writeFileSync(path, `bytes-${kind}`);
    return { kind, idx: i === 1 ? 1 : 0, path, bytes: 7 };
  });
  db.sessionCompleted({
    id: "abcdefghjk",
    completedAt: "2026-09-24T10:01:00Z",
    photoCount: 3,
    retakeCount: 0,
    printCount: 1,
    assets,
  });
  return db;
};

describe("uploader (N4)", () => {
  it("upsert sesi sekali, sign → PUT → catat aset per file, antrean habis", async () => {
    const db = setup();
    const calls: string[] = [];
    const puts: string[] = [];
    const up = createUploader({
      db,
      log: () => {},
      now: () => Date.parse("2026-09-24T10:02:00Z"),
      api: async (path, body) => {
        calls.push(path);
        const b = body as { assets?: { kind: string; idx: number }[] };
        if (path.endsWith("/sign"))
          return {
            uploads: b.assets?.map((a) => ({
              ...a,
              url: `https://r2/${a.kind}`,
              key: `k/${a.kind}`,
            })),
          };
        return { ok: true };
      },
      put: async (url, bytes) => {
        puts.push(`${url}=${new TextDecoder().decode(bytes)}`);
      },
    });
    await up.drain();
    expect(db.uploadPending()).toBe(0);
    expect(calls.filter((c) => c === "/api/booth/sessions").length).toBeGreaterThanOrEqual(1);
    expect(puts).toContain("https://r2/strip_web=bytes-strip_web");
    expect(db.query("select r2_key from assets where kind = 'strip'")).toEqual([
      { r2_key: "k/strip" },
    ]);
  });

  it("offline → semua gagal, backoff 5 dtk, error tercatat; berhenti tanpa loop", async () => {
    const db = setup();
    const t = Date.parse("2026-09-24T10:02:00Z");
    const up = createUploader({
      db,
      log: () => {},
      now: () => t,
      api: async () => {
        throw new Error("fetch failed");
      },
      put: async () => {},
    });
    await up.drain();
    expect(db.uploadPending()).toBe(3);
    expect(db.uploadError()).toBe("fetch failed");
    expect(db.dueUploads(new Date(t).toISOString(), 5)).toHaveLength(1);
    expect(db.dueUploads(new Date(t + BACKOFF_MS[0]!).toISOString(), 5)).toHaveLength(3);
  });
});
