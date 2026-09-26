import { describe, expect, it } from "vitest";
import { after, beforeCue, beforeText } from "../src/prompts";

const LIST = ["Siap", "Gaya kedua", "Paling heboh", "Terakhir"];

describe("kalimat & suara di sela foto (#103)", () => {
  it("sebelum foto: urut, foto terakhir memakai kalimat & suara terakhir", () => {
    expect([0, 1, 2].map((i) => beforeText(i, 3, LIST))).toEqual([
      "Siap",
      "Gaya kedua",
      "Terakhir",
    ]);
    expect([0, 1, 2, 3, 4].map((i) => beforeText(i, 5, LIST))).toEqual([
      "Siap",
      "Gaya kedua",
      "Paling heboh",
      "Paling heboh",
      "Terakhir",
    ]);
    expect([0, 1, 2].map((i) => beforeCue(i, 3))).toEqual(["foto-1", "foto-2", "foto-terakhir"]);
    expect(beforeCue(0, 1)).toBe("foto-1");
    expect(beforeText(0, 1, LIST)).toBe("Siap");
    expect(beforeText(3, 4, ["Satu"])).toBe("Satu");
    expect(beforeText(0, 3, [])).toBe("");
  });
  it("setelah foto: acak dari daftar, suara keren-1..3", () => {
    expect(after(["A", "B"], 0)).toEqual({ text: "A", cue: "keren-1" });
    expect(after(["A", "B"], 0.99)).toEqual({ text: "B", cue: "keren-3" });
  });
});
