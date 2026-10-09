import { describe, expect, it } from "vitest";
import { eventPhase, guestPhotosVisible } from "./events";

describe("eventPhase (daftar admin & portal Ops, #173)", () => {
  it("tanggal hari ini atau timer jalan/dijeda = berlangsung; lainnya dari tanggal", () => {
    expect(eventPhase("2026-10-07", "idle", "2026-10-07")).toBe("berlangsung");
    expect(eventPhase("2026-10-06", "running", "2026-10-07")).toBe("berlangsung");
    expect(eventPhase("2026-10-06", "paused", "2026-10-07")).toBe("berlangsung");
    expect(eventPhase("2026-10-06", "finished", "2026-10-07")).toBe("selesai");
    expect(eventPhase("2026-10-08", "idle", "2026-10-07")).toBe("mendatang");
  });
});

describe("guestPhotosVisible (Guest Cam #197)", () => {
  const now = Date.parse("2026-10-07T12:00:00+07:00");
  const ev = (reveal: string, extra: object = {}) => ({
    settings: { guestCam: { enabled: true, reveal } },
    run: null,
    event_date: "2026-10-07",
    guest_revealed_at: null,
    ...extra,
  });
  it("live selalu terlihat; after tertutup selama acara", () => {
    expect(guestPhotosVisible(ev("live"), now)).toBe(true);
    expect(guestPhotosVisible(ev("after"), now)).toBe(false);
  });
  it("after terbuka saat dibuka owner, tanggal lewat, atau acara dihentikan", () => {
    expect(
      guestPhotosVisible(ev("after", { guest_revealed_at: "2026-10-07T05:00:00Z" }), now),
    ).toBe(true);
    expect(guestPhotosVisible(ev("after", { event_date: "2026-10-06" }), now)).toBe(true);
    expect(
      guestPhotosVisible(
        ev("after", { run: { segments: [], finishedAt: "2026-10-07T04:00:00Z" } }),
        now,
      ),
    ).toBe(true);
  });
});
