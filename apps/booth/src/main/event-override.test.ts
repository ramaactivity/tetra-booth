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
