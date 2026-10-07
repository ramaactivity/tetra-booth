import { describe, expect, it } from "vitest";
import { eventPhase } from "./events";

describe("eventPhase (daftar admin & portal Ops, #173)", () => {
  it("tanggal hari ini atau timer jalan/dijeda = berlangsung; lainnya dari tanggal", () => {
    expect(eventPhase("2026-10-07", "idle", "2026-10-07")).toBe("berlangsung");
    expect(eventPhase("2026-10-06", "running", "2026-10-07")).toBe("berlangsung");
    expect(eventPhase("2026-10-06", "paused", "2026-10-07")).toBe("berlangsung");
    expect(eventPhase("2026-10-06", "finished", "2026-10-07")).toBe("selesai");
    expect(eventPhase("2026-10-08", "idle", "2026-10-07")).toBe("mendatang");
  });
});
