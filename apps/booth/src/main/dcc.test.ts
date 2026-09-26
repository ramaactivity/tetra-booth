import { describe, expect, it } from "vitest";
import { parseDccList } from "./dcc";

describe("parseDccList (digiCamControl slc=list)", () => {
  it("JSON array, teks per baris, atau dipisah koma", () => {
    expect(parseDccList('["100","200","400"]')).toEqual(["100", "200", "400"]);
    expect(parseDccList("1/60\r\n1/125\n\n1/250")).toEqual(["1/60", "1/125", "1/250"]);
    expect(parseDccList("5.6, 8 ,11")).toEqual(["5.6", "8", "11"]);
    expect(parseDccList("")).toEqual([]);
    // Kamera belum tersambung: pesan exception, bukan nilai (W, 2026-09-26).
    expect(parseDccList("Object reference not set to an instance of an object.")).toEqual([]);
  });
});
