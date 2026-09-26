import { DEFAULT_SETTINGS, type EventBundle } from "@tetra/shared";
import { describe, expect, it } from "vitest";
import { applyOverride, diffOverride, parseOverride } from "./event-override";

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
  it("isi kv rusak, di luar batas, atau field terlarang diabaikan", () => {
    expect(parseOverride(null)).toEqual({});
    expect(parseOverride("{bukan json")).toEqual({});
    expect(parseOverride('{"countdownSec":99}')).toEqual({});
    expect(parseOverride('{"countdownSec":4,"shotDelaySec":9}')).toEqual({ countdownSec: 4 });
  });
});
