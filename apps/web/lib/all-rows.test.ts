import { describe, expect, it } from "vitest";
import { allRows, PAGE } from "./all-rows";

describe("allRows", () => {
  it("mengambil lebih dari 1000 baris per halaman sampai habis", async () => {
    const rows = Array.from({ length: 2 * PAGE + 345 }, (_, i) => i);
    const calls: [number, number][] = [];
    const got = await allRows(async (a, b) => {
      calls.push([a, b]);
      return { data: rows.slice(a, b + 1), error: null };
    });
    expect(got).toHaveLength(rows.length);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });
  it("tepat kelipatan 1000: satu halaman kosong terakhir; error dilempar", async () => {
    const rows = Array.from({ length: PAGE }, (_, i) => i);
    expect(
      await allRows(async (a, b) => ({ data: rows.slice(a, b + 1), error: null })),
    ).toHaveLength(PAGE);
    await expect(allRows(async () => ({ data: null, error: new Error("402") }))).rejects.toThrow(
      "402",
    );
  });
});
