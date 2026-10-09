import { describe, expect, it } from "vitest";
import { GUEST_LINK, readableLink } from "./guest-link";

describe("readableLink", () => {
  it("membuang kata umum dan simbol", () => {
    expect(readableLink("Wedding Rafi & Dinda")).toBe("rafi-dinda");
    expect(readableLink("Wedding Adel & Alpi")).toBe("adel-alpi");
    expect(readableLink("Ulang Tahun ke-17 Nadhira Putri Ramadhani")).toBe(
      "nadhira-putri-ramadhani",
    );
    expect(readableLink("Gathering PT Café Sejahtera 2026")).toBe("gathering-pt-cafe-sejahtera");
  });
  it("selalu valid", () => {
    for (const n of ["Wedding", "&&&", "A", "Akad & Resepsi 2026"])
      expect(readableLink(n)).toMatch(GUEST_LINK);
  });
});
