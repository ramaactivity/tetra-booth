import { describe, expect, it } from "vitest";
import { groupLines } from "./stage-groups";

describe("daftar grup Photo Stage (#181)", () => {
  it("tempel dari WA/Excel/CSV: kolom pertama, nomor urut & duplikat dibuang, koma tetap", () => {
    expect(
      groupLines(
        '1. Keluarga Inti\r\n2) Keluarga Besar Bpk. Hadi, Bogor\nTeman Kantor PT ABC\t12 orang\n"Sahabat SMA";Wanita\n\n  Keluarga Inti  \n',
      ),
    ).toEqual([
      "Keluarga Inti",
      "Keluarga Besar Bpk. Hadi, Bogor",
      "Teman Kantor PT ABC",
      "Sahabat SMA",
    ]);
  });
  it("kosong = daftar kosong; maks. 300 grup × 120 karakter", () => {
    expect(groupLines(null)).toEqual([]);
    const many = Array.from({ length: 400 }, (_, i) => `Grup ${i} ${"x".repeat(200)}`).join("\n");
    const r = groupLines(many);
    expect(r).toHaveLength(300);
    expect(r[0]?.length).toBe(120);
  });
});
