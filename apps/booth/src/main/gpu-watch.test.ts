import { describe, expect, it } from "vitest";
import { createGpuWatch } from "./gpu-watch";

const setup = () => {
  let t = 0;
  const relaunches: number[] = [];
  const w = createGpuWatch({ relaunch: () => relaunches.push(t), log: () => {}, now: () => t });
  return {
    w,
    relaunches,
    at: (ms: number) => {
      t = ms;
    },
  };
};

describe("GPU watch (M-016)", () => {
  it("3 kali mati dalam 10 menit saat di attract → relaunch langsung", () => {
    const { w, relaunches, at } = setup();
    for (const ms of [0, 60_000, 120_000]) {
      at(ms);
      w.gpuGone("crashed");
    }
    expect(relaunches).toEqual([120_000]);
  });

  it("di tengah sesi: ditunda sampai kembali ke attract", () => {
    const { w, relaunches, at } = setup();
    w.phase("countdown");
    for (const ms of [0, 1000, 2000]) {
      at(ms);
      w.gpuGone("crashed");
    }
    expect(relaunches).toEqual([]);
    expect(w.pending).toBe(true);
    w.phase("review");
    expect(relaunches).toEqual([]);
    at(5000);
    w.phase("attract");
    expect(relaunches).toEqual([5000]);
  });

  it("mati jarang (di luar jendela 10 menit) tidak memicu relaunch", () => {
    const { w, relaunches, at } = setup();
    for (const ms of [0, 11 * 60_000, 22 * 60_000]) {
      at(ms);
      w.gpuGone("crashed");
    }
    expect(relaunches).toEqual([]);
  });
});
