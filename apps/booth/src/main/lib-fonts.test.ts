import { existsSync } from "node:fs";
import { join } from "node:path";
import { LIB_FONTS } from "@tetra/editor";
import { describe, expect, it } from "vitest";

describe("font pustaka editor ikut di booth (#131, offline)", () => {
  it("setiap LIB_FONTS ada di renderer public/fonts", () => {
    const dir = join(__dirname, "../renderer/public/fonts");
    expect(LIB_FONTS.filter((f) => !existsSync(join(dir, f.file))).map((f) => f.file)).toEqual([]);
  });
});
