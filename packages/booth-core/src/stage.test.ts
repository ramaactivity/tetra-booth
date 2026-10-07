import { FIXTURES } from "@tetra/template-engine";
import { describe, expect, it } from "vitest";
import {
  activeGroup,
  initialStage,
  type StageState,
  stagePrintLayout,
  stageReducer,
} from "./stage";

const shot = (at: number) => ({ path: `/s/${at}.jpg`, width: 6000, height: 4000, at });
const run = (s: StageState, ...as: Parameters<typeof stageReducer>[1][]) =>
  as.reduce(stageReducer, s);
const S = 1000;

describe("Photo Stage: pengelompokan rombongan (#178)", () => {
  it("jepretan beruntun = satu rombongan; jeda > batas = rombongan baru", () => {
    const s = run(
      initialStage(45),
      { type: "SHOT", shot: shot(0), id: "a" },
      { type: "SHOT", shot: shot(10 * S), id: "x" },
      { type: "SHOT", shot: shot(70 * S), id: "b" },
    );
    expect(s.groups.map((g) => [g.id, g.no, g.shots.length, g.closedAt])).toEqual([
      ["a", 1, 2, 10 * S],
      ["b", 2, 1, null],
    ]);
  });

  it("jeda otomatis mati: hanya tombol Rombongan baru yang memisahkan", () => {
    const s = run(
      initialStage(null),
      { type: "SHOT", shot: shot(0), id: "a" },
      { type: "SHOT", shot: shot(600 * S), id: "x" },
      { type: "TICK", now: 900 * S },
    );
    expect(s.groups).toHaveLength(1);
    expect(activeGroup(s)?.shots).toHaveLength(2);
  });

  it("Rombongan baru: nama bisa diisi sebelum foto masuk; rombongan kosong tidak ditutup jadi sesi", () => {
    let s = run(
      initialStage(45),
      { type: "SHOT", shot: shot(0), id: "a" },
      { type: "NEW_GROUP", id: "b", now: 5 * S },
      { type: "NEW_GROUP", id: "c", now: 6 * S },
      { type: "RENAME", id: "b", name: "  Keluarga Besar Bpk. Hadi " },
    );
    expect(s.groups.map((g) => [g.id, g.name, g.closedAt])).toEqual([
      ["a", null, 5 * S],
      ["b", "Keluarga Besar Bpk. Hadi", null],
    ]);
    s = run(s, { type: "SHOT", shot: shot(100 * S), id: "z" });
    expect(activeGroup(s)?.id).toBe("b");
    expect(activeGroup(s)?.shots).toHaveLength(1);
  });

  it("TICK menutup rombongan aktif setelah jeda", () => {
    const s = run(
      initialStage(45),
      { type: "SHOT", shot: shot(0), id: "a" },
      { type: "TICK", now: 46 * S },
    );
    expect(s.groups[0]?.closedAt).toBe(46 * S);
    expect(activeGroup(s)).toBeNull();
  });

  it("Jeda menampung jepretan, lalu dimasukkan ke rombongan", () => {
    let s = run(
      initialStage(45),
      { type: "PAUSE" },
      { type: "SHOT", shot: shot(0), id: "x" },
      { type: "SHOT", shot: shot(1 * S), id: "y" },
    );
    expect(s.groups).toHaveLength(0);
    expect(s.loose).toHaveLength(2);
    s = run(s, { type: "RESUME" }, { type: "ASSIGN_LOOSE", id: "a", now: 2 * S });
    expect(s.loose).toHaveLength(0);
    expect(activeGroup(s)?.shots).toHaveLength(2);
  });

  it("lebih dari 20 foto = rombongan baru otomatis", () => {
    const shots = Array.from({ length: 21 }, (_, i) => ({
      type: "SHOT" as const,
      shot: shot(i * S),
      id: `g${i}`,
    }));
    const s = run(initialStage(null), ...shots);
    expect(s.groups.map((g) => g.shots.length)).toEqual([20, 1]);
  });
});

describe("stagePrintLayout (#183)", () => {
  it("frame 4R satu slot dipakai, selain itu foto penuh mengikuti arah foto", () => {
    const one = { ...FIXTURES["4R"], slots: FIXTURES["4R"].slots.slice(0, 1) };
    expect(stagePrintLayout(one, { width: 6000, height: 4000 })).toBe(one);
    const wide = stagePrintLayout(FIXTURES["2x6x2"], { width: 6000, height: 4000 });
    expect([wide.paper, wide.canvas.width, wide.canvas.height]).toEqual(["4R", 1800, 1200]);
    expect(stagePrintLayout(FIXTURES["2x6x2"], { width: 4000, height: 6000 }).canvas.width).toBe(
      1200,
    );
  });
});

describe("baki jeda (#186)", () => {
  it("jadi rombongan baru menutup yang aktif; sembunyikan membuang dari layar", () => {
    const base = run(
      initialStage(null),
      { type: "SHOT", shot: shot(1000), id: "a" },
      { type: "PAUSE" },
    );
    const s = run(
      base,
      { type: "SHOT", shot: shot(2000), id: "x" },
      { type: "LOOSE_TO_NEW", id: "b", now: 3000 },
    );
    expect(s.groups.map((g) => [g.id, g.shots.length, g.closedAt !== null])).toEqual([
      ["a", 1, true],
      ["b", 1, false],
    ]);
    expect(s.loose).toEqual([]);
    const d = run(base, { type: "SHOT", shot: shot(2000), id: "x" }, { type: "DROP_LOOSE" });
    expect([d.loose.length, d.groups.length]).toEqual([0, 1]);
  });
});
