import { describe, expect, it } from "vitest";
import { queueCalled, queueLoad, queueReduce, queueWaiting } from "./queue";

const DAY = "2026-10-14";

describe("antrean photobox", () => {
  it("ambil nomor → dipanggil berurutan; mulai sesi / lewati memakai giliran", () => {
    let q = queueLoad(null, DAY);
    expect(queueCalled(q)).toBeNull();
    q = queueReduce(q, "take");
    q = queueReduce(q, "take");
    q = queueReduce(q, "take");
    expect(q).toEqual({ day: DAY, issued: 3, served: 0 });
    expect(queueCalled(q)).toBe(1);
    expect(queueWaiting(q)).toBe(3);
    q = queueReduce(q, "start");
    expect(queueCalled(q)).toBe(2);
    q = queueReduce(q, "next");
    expect(queueCalled(q)).toBe(3);
    q = queueReduce(q, "start");
    expect(queueCalled(q)).toBeNull();
    expect(queueWaiting(q)).toBe(0);
    // Tanpa antrean: sesi walk-in / lewati tidak mengubah apa pun.
    expect(queueReduce(q, "start")).toBe(q);
    expect(queueReduce(q, "next")).toBe(q);
    expect(queueCalled(queueReduce(q, "take"))).toBe(4);
  });

  it("hari baru atau data rusak = mulai dari 1 lagi", () => {
    const saved = JSON.stringify({ day: DAY, issued: 7, served: 5 });
    expect(queueLoad(saved, DAY)).toEqual({ day: DAY, issued: 7, served: 5 });
    expect(queueLoad(saved, "2026-10-15")).toEqual({ day: "2026-10-15", issued: 0, served: 0 });
    for (const bad of ["{", "[]", '{"day":"2026-10-14","issued":2,"served":3}', '"x"'])
      expect(queueLoad(bad, DAY)).toEqual({ day: DAY, issued: 0, served: 0 });
  });
});
