import { describe, expect, it } from "vitest";
import { flickerShutter } from "./CameraProps";

describe("flickerShutter", () => {
  it("memilih 1/50 (PAL) atau 1/60 (NTSC), atau yang terdekat", () => {
    const canon = ['30"', "1/30", "1/40", "1/45", "1/50", "1/60", "1/80", "1/125", "Bulb"];
    expect(flickerShutter(canon, 50)).toBe("1/50");
    expect(flickerShutter(canon, 60)).toBe("1/60");
    expect(flickerShutter(["1/30", "1/45", "1/90", "1/125"], 50)).toBe("1/45");
    expect(flickerShutter(["Bulb"], 50)).toBeUndefined();
  });
});
