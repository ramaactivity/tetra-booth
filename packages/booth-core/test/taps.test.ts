import { describe, expect, it } from "vitest";
import { createTapDetector } from "../src/crew/taps";

describe("tap 5x dalam 3 detik", () => {
  it("terpicu di tap ke-5 dalam jendela, lalu reset", () => {
    const tap = createTapDetector();
    expect([0, 500, 1000, 1500].map(tap)).toEqual([false, false, false, false]);
    expect(tap(2000)).toBe(true);
    expect(tap(2100)).toBe(false);
  });
  it("tap yang terlalu jarang tidak terpicu", () => {
    const tap = createTapDetector();
    expect([0, 1000, 2000, 3000, 4000, 5000].map(tap).some(Boolean)).toBe(false);
  });
});
