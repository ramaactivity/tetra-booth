import { describe, expect, it } from "vitest";
import {
  applyRun,
  durationText,
  EMPTY_RUN,
  runElapsedMs,
  runPausedMs,
  runState,
  runVerdict,
  setRunTimes,
} from "./run";

const T = (hhmm: string) => `2026-10-04T${hhmm}:00.000Z`;
const now = Date.parse(T("23:00"));

describe("timer event", () => {
  it("mulai → jeda → lanjut → selesai, jeda tidak dihitung", () => {
    let r = applyRun(EMPTY_RUN, "open", T("10:00"), now);
    expect(runState(r)).toBe("running");
    r = applyRun(r, "pause", T("11:00"), now);
    expect(runState(r)).toBe("paused");
    r = applyRun(r, "open", T("11:30"), now);
    r = applyRun(r, "finish", T("13:00"), now);
    expect(runState(r)).toBe("finished");
    expect(runElapsedMs(r, now)).toBe(150 * 60_000);
    expect(runPausedMs(r, now)).toBe(30 * 60_000);
    // Buka untuk Tamu setelah selesai tidak membuka lagi; Lanjutkan admin membuka lagi.
    expect(applyRun(r, "open", T("14:00"), now)).toBe(r);
    expect(runState(applyRun(r, "start", T("14:00"), now))).toBe("running");
  });

  it("id aksi sama tidak diterapkan dua kali; aksi offline terlambat tidak mundur", () => {
    const id = "6f1c2b9e-0d7a-4e57-9a43-1f2b3c4d5e6f";
    let r = applyRun(EMPTY_RUN, "open", T("10:00"), now, id);
    r = applyRun(r, "pause", T("12:00"), now);
    expect(applyRun(r, "open", T("10:00"), now, id)).toBe(r);
    // Booth offline: jeda 11:00 tiba setelah admin menjeda 12:00 → tidak berlaku (sudah dijeda).
    expect(applyRun(r, "pause", T("11:00"), now)).toBe(r);
    // Lanjut dengan jam sebelum jeda terakhir → digeser ke batas segmen.
    const late = applyRun(r, "open", T("11:30"), now);
    expect(late.segments[1]?.start).toBe(T("12:00"));
  });

  it("jam booth jauh di depan server memakai jam server", () => {
    const r = applyRun(EMPTY_RUN, "open", "2027-01-01T00:00:00.000Z", now);
    expect(r.segments[0]?.start).toBe(new Date(now).toISOString());
  });

  it("koreksi manual jam mulai & selesai", () => {
    const r = setRunTimes(EMPTY_RUN, T("09:00"), T("12:00"), now);
    expect(r && runElapsedMs(r, now)).toBe(180 * 60_000);
    expect(r && runState(r)).toBe("finished");
    expect(setRunTimes(EMPTY_RUN, T("12:00"), T("09:00"), now)).toBeNull();
    let x = applyRun(EMPTY_RUN, "open", T("10:00"), now);
    x = applyRun(x, "pause", T("11:00"), now);
    x = applyRun(x, "open", T("11:30"), now);
    const y = setRunTimes(x, T("09:30"), T("13:00"), now);
    expect(y?.segments).toEqual([
      { start: T("09:30"), end: T("11:00") },
      { start: T("11:30"), end: T("13:00") },
    ]);
    expect(setRunTimes(x, T("11:10"), null, now)).toBeNull();
  });

  it("vonis durasi vs paket", () => {
    expect(runVerdict(183 * 60_000, 3)).toEqual({ kind: "ok", minutes: 3 });
    expect(runVerdict(200 * 60_000, 3)).toEqual({ kind: "over", minutes: 20 });
    expect(runVerdict(150 * 60_000, 3)).toEqual({ kind: "under", minutes: 30 });
    expect(durationText(192)).toBe("3 jam 12 menit");
    expect(durationText(45)).toBe("45 menit");
    expect(durationText(120)).toBe("2 jam");
  });
});
