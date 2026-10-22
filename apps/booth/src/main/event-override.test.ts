import { DEFAULT_SETTINGS, type EventBundle } from "@tetra/shared";
import { describe, expect, it } from "vitest";
import { applyOverride, diffOverride, parseOverride, storeOverride } from "./event-override";

const bundle = { id: "e1", settings: { ...DEFAULT_SETTINGS, countdownSec: 3 } } as EventBundle;

describe("override pengaturan event di booth (#100)", () => {
  it("hanya field yang berbeda dari cloud disimpan", () => {
    expect(
      diffOverride(bundle.settings, { countdownSec: 5, retakeMax: DEFAULT_SETTINGS.retakeMax }),
    ).toEqual({
      countdownSec: 5,
    });
    expect(diffOverride(bundle.settings, { countdownSec: 3 })).toEqual({});
  });
  it("override menimpa settings bundle; kosong = bundle apa adanya", () => {
    expect(applyOverride(bundle, { countdownSec: 7 }).settings.countdownSec).toBe(7);
    expect(applyOverride(bundle, {})).toBe(bundle);
  });
  it("photobox: maxPrints tidak di-override (batas lembar tambahan dari cloud, #100)", () => {
    const pb = { ...bundle, mode: "photobox" } as EventBundle;
    const r = applyOverride(pb, { maxPrints: 5, countdownSec: 4 });
    expect(r.settings.maxPrints).toBe(DEFAULT_SETTINGS.maxPrints);
    expect(r.settings.countdownSec).toBe(4);
  });
  it("isi kv rusak, di luar batas, atau field terlarang diabaikan", () => {
    expect(parseOverride(null)).toEqual({});
    expect(parseOverride("{bukan json")).toEqual({});
    expect(parseOverride('{"countdownSec":99}')).toEqual({});
    expect(parseOverride('{"countdownSec":4,"shotDelaySec":9}')).toEqual({ countdownSec: 4 });
  });
});

describe("waktu ngaca diubah di booth (Rama 14 Okt)", () => {
  it("0 = layar ngaca mati, tetap disimpan sebagai override", () => {
    expect(diffOverride(bundle.settings, { mirrorSec: 0 })).toEqual({ mirrorSec: 0 });
    expect(applyOverride(bundle, { mirrorSec: 0 }).settings.mirrorSec).toBe(0);
  });
  it("sama dengan cloud bukan override; di luar 0–60 ditolak", () => {
    expect(diffOverride(bundle.settings, { mirrorSec: DEFAULT_SETTINGS.mirrorSec })).toEqual({});
    expect(parseOverride('{"mirrorSec":10}')).toEqual({ mirrorSec: 10 });
    expect(parseOverride('{"mirrorSec":99}')).toEqual({});
  });
});

describe("override vs perubahan admin (#255)", () => {
  const cloud = { ...DEFAULT_SETTINGS, countdownSec: 3, maxPrints: 2 };
  it("admin mengubah nilai sesudah override disimpan → nilai admin berlaku", () => {
    const raw = storeOverride(cloud, { countdownSec: 5, maxPrints: 5 });
    expect(parseOverride(raw, cloud)).toEqual({ countdownSec: 5, maxPrints: 5 });
    expect(parseOverride(raw, { ...cloud, countdownSec: 4 })).toEqual({ maxPrints: 5 });
  });
  it("override lama tanpa base tetap berlaku", () => {
    expect(parseOverride('{"countdownSec":5}', { ...cloud, countdownSec: 4 })).toEqual({
      countdownSec: 5,
    });
  });
});

describe("Backstage tahap 1: sakelar & daftar (#291)", () => {
  const cloud = { ...DEFAULT_SETTINGS, filters: ["bw" as const], promptsAfter: ["Mantap!"] };
  it("daftar dibandingkan isinya: sama dengan cloud bukan override", () => {
    expect(diffOverride(cloud, { filters: ["bw"], promptsAfter: ["Mantap!"] })).toEqual({});
    expect(diffOverride(cloud, { filters: [], countdownSound: true })).toEqual({
      filters: [],
      countdownSound: true,
    });
  });
  it("override daftar bertahan setelah disimpan & dibaca ulang (cloud tidak berubah)", () => {
    const raw = storeOverride(cloud, { filters: ["warm", "bw"], bumper: false });
    expect(parseOverride(raw, { ...cloud, filters: ["bw"] })).toEqual({
      filters: ["warm", "bw"],
      bumper: false,
    });
    // Admin mengganti filter sesudahnya → nilai admin berlaku.
    expect(parseOverride(raw, { ...cloud, filters: ["vintage"] })).toEqual({ bumper: false });
  });
  it("filter tak dikenal / kalimat terlalu panjang ditolak", () => {
    expect(parseOverride('{"filters":["neon"]}')).toEqual({});
    expect(parseOverride(`{"promptsBefore":["${"x".repeat(41)}"]}`)).toEqual({});
  });
});
