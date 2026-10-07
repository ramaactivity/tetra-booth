import { describe, expect, it } from "vitest";
import { columnItems, columnsFor } from "../src/screens/Attract";

describe("kolom layar awal (#143)", () => {
  it("2R 3 kolom sempit, 4R/polaroid 2 kolom, potongan sangat lebar 1 kolom", () => {
    expect(columnsFor(600 / 1800)).toEqual({ n: 3, width: 220 });
    expect(columnsFor(1200 / 1800).n).toBe(2);
    expect(columnsFor(900 / 1200).n).toBe(2);
    expect(columnsFor(1800 / 1200).n).toBe(2);
    expect(columnsFor(1800 / 600)).toEqual({ n: 1, width: 748 });
  });

  it("kartu dibagi bergiliran, kolom kosong meminjam, isi diulang & digandakan untuk loop", () => {
    const h = () => 700;
    expect(columnItems([1, 2, 3, 4], 0, 3, h)).toEqual([1, 4, 1, 4]);
    expect(columnItems([1], 2, 3, h)).toEqual([1, 1, 1, 1]);
    expect(columnItems([], 0, 3, h)).toEqual([]);
  });
});
