import { describe, expect, it } from "vitest";
import { newerVersion } from "./booth-api";

describe("newerVersion", () => {
  it("membandingkan per angka, bukan per teks", () => {
    expect(newerVersion("0.10.0", "0.9.9")).toBe(true);
    expect(newerVersion("0.5.1", "0.5.0")).toBe(true);
    expect(newerVersion("0.5.0", "0.5.0")).toBe(false);
    expect(newerVersion("0.4.9", "0.5.0")).toBe(false);
    expect(newerVersion("1.0.0", "0.99.99")).toBe(true);
  });
});
