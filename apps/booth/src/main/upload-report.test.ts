import { describe, expect, it } from "vitest";
import { pendingByEvent, summarizeUploads } from "./upload-report";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const row = (id: string, eventId: string, files: number, sent: number) => ({
  id,
  eventId,
  completedAt: "2026-10-16T10:00:00Z",
  files,
  sent,
  error: null,
});

describe("status upload per event (#271)", () => {
  const rows = [row("s1", A, 6, 6), row("s2", A, 6, 2), row("s3", A, 6, 0), row("s4", B, 4, 4)];
  it("sesi terkirim = semua file terunggah; file dijumlah", () => {
    expect(summarizeUploads(rows)).toEqual([
      { eventId: A, sessions: 3, sentSessions: 1, files: 18, sentFiles: 8 },
      { eventId: B, sessions: 1, sentSessions: 1, files: 4, sentFiles: 4 },
    ]);
  });
  it("heartbeat hanya memuat event yang masih punya sisa", () => {
    expect(pendingByEvent(rows)).toEqual([{ eventId: A, sessions: 2, files: 10 }]);
    expect(pendingByEvent([row("s4", B, 4, 4)])).toEqual([]);
  });
});
