import { describe, expect, it } from "vitest";
import { fit } from "../src/finalize";

describe("fit", () => {
  it("mengecilkan ke sisi panjang, menjaga rasio", () => {
    expect(fit(6000, 4000, 2400)).toEqual({ width: 2400, height: 1600 });
    expect(fit(1944, 2592, 480)).toEqual({ width: 360, height: 480 });
  });
  it("tidak pernah memperbesar", () => {
    expect(fit(1920, 1080, 2400)).toEqual({ width: 1920, height: 1080 });
  });
});
