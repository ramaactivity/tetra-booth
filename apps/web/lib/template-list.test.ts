import { describe, expect, it } from "vitest";
import { eventUsage, filterSort, stats, type TemplateRow } from "./template-list";

const row = (o: Partial<TemplateRow>): TemplateRow => ({
  id: "x",
  name: "x",
  paper: "4R",
  landscape: false,
  savedAt: "2026-10-01T00:00:00Z",
  events: 0,
  lastEvent: null,
  sessions: 0,
  prints: 0,
  sessionsMonth: 0,
  lastUsed: null,
  ...o,
});

describe("template list", () => {
  it("eventUsage: versions, layoutId lama, dan photobox; satu event dihitung sekali", () => {
    const u = eventUsage([
      { event_date: "2026-09-01", tpl: { layoutId: "a", versions: { a: 2, b: 1 } }, pb: [] },
      { event_date: "2026-10-09", tpl: { layoutId: "a" }, pb: null },
      { event_date: "2026-09-20", tpl: null, pb: [{ template: "c", price: 1 }, { preset: "x" }] },
    ]);
    expect(u.get("a")).toEqual({ events: 2, last: "2026-10-09" });
    expect(u.get("b")).toEqual({ events: 1, last: "2026-09-01" });
    expect(u.get("c")).toEqual({ events: 1, last: "2026-09-20" });
  });

  it("filterSort: cari, kertas, arah, urut dipakai", () => {
    const rows = [
      row({ id: "1", name: "Andi", paper: "2x6x2", sessions: 3 }),
      row({ id: "2", name: "budi", paper: "4R", landscape: true, sessions: 9 }),
      row({ id: "3", name: "Cici", paper: "3x4x2", events: 5, savedAt: "2026-10-03T00:00:00Z" }),
    ];
    const f = { q: "", kertas: "", arah: "", urut: "disimpan" as const };
    expect(filterSort(rows, f, false).map((r) => r.id)).toEqual(["3", "1", "2"]);
    expect(filterSort(rows, { ...f, urut: "dipakai" }, true).map((r) => r.id)).toEqual([
      "2",
      "1",
      "3",
    ]);
    expect(filterSort(rows, { ...f, urut: "nama" }, false).map((r) => r.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(filterSort(rows, { ...f, kertas: "2R" }, false).map((r) => r.id)).toEqual(["1"]);
    expect(filterSort(rows, { ...f, arah: "landscape" }, false).map((r) => r.id)).toEqual(["2"]);
    expect(filterSort(rows, { ...f, q: "BUD" }, false).map((r) => r.id)).toEqual(["2"]);
  });

  it("stats: per kertas, sesi bulan ini, terfavorit", () => {
    const s = stats(
      [
        row({ id: "a", paper: "2x6x2", sessions: 4, sessionsMonth: 4 }),
        row({ id: "b", paper: "2x6x2", sessionsMonth: 7, events: 1, lastEvent: "2026-10-10" }),
        row({ id: "c", paper: "3x4x2" }),
      ],
      "2026-10-04",
    );
    expect(s.paper).toEqual({ "2R": 2, "4R": 0, Polaroid: 1 });
    expect(s.sessionsMonth).toBe(11);
    expect(s.top?.id).toBe("b");
    expect(s.unused).toBe(1);
    expect(s.upcoming).toBe(1);
  });
});
