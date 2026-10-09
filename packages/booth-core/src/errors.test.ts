import { describe, expect, it } from "vitest";
import { afSuspect } from "./errors";

describe("afSuspect", () => {
  it("jepret sibuk / tidak menjawab = saran AF→MF; terputus = bukan", () => {
    expect(afSuspect(new Error("kamera Canon tidak menjawab; matikan lalu nyalakan kamera"))).toBe(true);
    expect(afSuspect(new Error("Camera Service tidak menjawab"))).toBe(true);
    expect(afSuspect(new Error("EDSDK jepret gagal: 0x00000081"))).toBe(true);
    expect(afSuspect(new Error("kamera tidak mengirim foto"))).toBe(true);
    expect(afSuspect(new Error("kamera Canon belum tersambung"))).toBe(false);
    expect(afSuspect(new Error("kamera terputus saat jepret"))).toBe(false);
  });
});
