import { describe, expect, it } from "vitest";
import {
  initialSession,
  type Photo,
  type SessionEvent,
  type SessionState,
  sessionReducer,
} from "../src/session";

const photo = (n: number): Photo => ({
  path: `/s/${n}.jpg`,
  url: `blob:${n}`,
  width: 3,
  height: 2,
});
const run = (events: SessionEvent[], from: SessionState = initialSession) =>
  events.reduce(sessionReducer, from);
const start: SessionEvent = { type: "START", sessionId: "abc", slots: 3, retakeMax: 1 };
const shoot = (n: number): SessionEvent[] => [
  { type: "COUNTDOWN_DONE" },
  { type: "CAPTURED", photo: photo(n) },
];
const shootAll = [
  ...shoot(1),
  { type: "PREVIEW_DONE" },
  ...shoot(2),
  { type: "PREVIEW_DONE" },
  ...shoot(3),
  { type: "PREVIEW_DONE" },
] satisfies SessionEvent[];

describe("sessionReducer", () => {
  it("alur lengkap: attract → 3 foto → review → compose → cetak → QR → attract", () => {
    const review = run([start, ...shootAll]);
    expect(review.phase).toBe("review");
    expect(review.photos.map((p) => p?.path)).toEqual(["/s/1.jpg", "/s/2.jpg", "/s/3.jpg"]);

    const qr = run(
      [
        { type: "CONTINUE" },
        { type: "COMPOSED", strip: { path: "/s/strip.jpg", url: "blob:s" } },
        { type: "PRINTS_SELECTED", count: 2 },
        { type: "PRINT_DONE" },
      ],
      review,
    );
    expect(qr.phase).toBe("qr");
    expect(qr.prints).toBe(2);
    expect(qr.sessionId).toBe("abc");
    expect(sessionReducer(qr, { type: "FINISH" })).toEqual(initialSession);
  });

  it("preview antar foto menaikkan index; foto terakhir ke review", () => {
    const s = run([start, ...shoot(1)]);
    expect(s.phase).toBe("preview");
    const s2 = sessionReducer(s, { type: "PREVIEW_DONE" });
    expect([s2.phase, s2.index]).toEqual(["countdown", 1]);
  });

  it("retake: hanya foto itu yang diganti, kembali ke review, dibatasi retakeMax", () => {
    const review = run([start, ...shootAll]);
    const retake = run([{ type: "RETAKE", index: 1 }, ...shoot(9)], review);
    expect(retake.phase).toBe("review");
    expect(retake.photos.map((p) => p?.path)).toEqual(["/s/1.jpg", "/s/9.jpg", "/s/3.jpg"]);
    expect(retake.retakesUsed).toEqual([0, 1, 0]);
    // batas 1x: retake kedua untuk foto yang sama diabaikan
    expect(sessionReducer(retake, { type: "RETAKE", index: 1 })).toBe(retake);
    // foto lain masih boleh
    expect(sessionReducer(retake, { type: "RETAKE", index: 0 }).phase).toBe("countdown");
  });

  it("retake di luar batas index diabaikan", () => {
    const review = run([start, ...shootAll]);
    expect(sessionReducer(review, { type: "RETAKE", index: 5 })).toBe(review);
  });

  it("capture gagal: retry otomatis 1x, lalu kamera_error, lalu lanjut dari foto yang gagal", () => {
    const capturing = run([
      start,
      ...shoot(1),
      { type: "PREVIEW_DONE" },
      { type: "COUNTDOWN_DONE" },
    ]);
    expect([capturing.phase, capturing.index, capturing.attempt]).toEqual(["capture", 1, 1]);

    const retry = sessionReducer(capturing, { type: "CAPTURE_FAILED" });
    expect([retry.phase, retry.attempt]).toEqual(["capture", 2]);

    const err = sessionReducer(retry, { type: "CAPTURE_FAILED" });
    expect(err.phase).toBe("camera_error");

    const resumed = run([{ type: "CAMERA_READY" }, ...shoot(2)], err);
    expect([resumed.phase, resumed.index]).toEqual(["preview", 1]);
    expect(resumed.photos[0]?.path).toBe("/s/1.jpg");
  });

  it("compose gagal: lewati cetak, langsung QR", () => {
    const s = run([start, ...shootAll, { type: "CONTINUE" }, { type: "COMPOSE_FAILED" }]);
    expect(s.phase).toBe("qr");
  });

  it("event di fase yang salah diabaikan (tidak ada lompatan state)", () => {
    expect(sessionReducer(initialSession, { type: "CAPTURED", photo: photo(1) })).toBe(
      initialSession,
    );
    expect(sessionReducer(initialSession, { type: "FINISH" })).toBe(initialSession);
    const review = run([start, ...shootAll]);
    expect(sessionReducer(review, { type: "PRINTS_SELECTED", count: 1 })).toBe(review);
    const printSelect = run(
      [{ type: "CONTINUE" }, { type: "COMPOSED", strip: { path: "p", url: "u" } }],
      review,
    );
    expect(sessionReducer(printSelect, { type: "PRINTS_SELECTED", count: 0 })).toBe(printSelect);
    expect(run([start, start]).sessionId).toBe("abc");
  });
});
