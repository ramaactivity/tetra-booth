import { describe, expect, it } from "vitest";
import { liveMissed, liveSeen, waitsForLive } from "../src/screens/LiveView";

describe("tunggu frame live view pertama sebelum hitung mundur", () => {
  it("kamera baru ditunggu; habis waktu tanpa frame → tidak ditunggu lagi", () => {
    const cam = {};
    expect(waitsForLive(cam)).toBe(true);
    liveMissed(cam);
    expect(waitsForLive(cam)).toBe(false);
  });
  it("kamera yang pernah mengirim frame tetap ditunggu walau sekali terlambat", () => {
    const cam = {};
    liveSeen(cam);
    liveMissed(cam);
    expect(waitsForLive(cam)).toBe(true);
  });
  it("frame datang lagi setelah habis waktu → ditunggu lagi", () => {
    const cam = {};
    liveMissed(cam);
    liveSeen(cam);
    expect(waitsForLive(cam)).toBe(true);
  });
});
