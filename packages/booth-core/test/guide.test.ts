import { describe, expect, it } from "vitest";
import { guideRect } from "../src/screens/LiveView";

describe("panduan bingkai live view (#107)", () => {
  it("slot 3:2 dari kamera 3:2 di layar 16:9: selebar layar, sama dengan potongan cover kamera", () => {
    const r = guideRect(6000, 4000, 1920, 1080, 3 / 2);
    expect(r.w).toBeCloseTo(1920);
    expect(r.h).toBeCloseTo(1280);
    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(-100);
  });
  it("slot portrait 3:4 dari kamera 3:2: potongan tengah, lebih sempit", () => {
    const r = guideRect(6000, 4000, 1920, 1080, 3 / 4);
    expect(r.h).toBeCloseTo(1280);
    expect(r.w).toBeCloseTo(960);
    expect(r.x).toBeCloseTo(480);
  });
});
