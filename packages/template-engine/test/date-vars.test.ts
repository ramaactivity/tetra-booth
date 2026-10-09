import { describe, expect, it } from "vitest";
import { dateVars } from "../src";

describe("dateVars", () => {
  it("menurunkan bentuk tanggal Snapbook dari ISO maupun tanggal panjang booth", () => {
    const want = { date_iso: "2026-10-10", date_long: "10 Oktober 2026", date_dot: "10.10.26" };
    expect(dateVars("2026-10-10")).toEqual(want);
    expect(dateVars("10 Oktober 2026")).toEqual(want);
    expect(dateVars("5 Maret 2027")).toEqual({
      date_iso: "2027-03-05",
      date_long: "5 Maret 2027",
      date_dot: "05.03.27",
    });
  });
  it("tanggal tak terbaca dipakai apa adanya", () => {
    expect(dateVars("Sabtu malam").date_dot).toBe("Sabtu malam");
  });
});
