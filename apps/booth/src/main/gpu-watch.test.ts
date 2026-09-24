import { describe, expect, it } from "vitest";
import { createGpuWatch } from "./gpu-watch";

const setup = () => {
  let relaunches = 0;
  const w = createGpuWatch({ relaunch: () => relaunches++, log: () => {} });
  return { w, relaunches: () => relaunches };
};

describe("GPU watch (M-016, M-017)", () => {
  it("GPU mati saat di attract → relaunch langsung", () => {
    const { w, relaunches } = setup();
    w.gpuGone("crashed");
    expect(relaunches()).toBe(1);
    expect(w.pending).toBe(false);
  });

  it("di tengah sesi: ditunda sampai kembali ke attract, sekali saja", () => {
    const { w, relaunches } = setup();
    w.phase("countdown");
    w.gpuGone("crashed");
    w.gpuGone("crashed");
    expect(relaunches()).toBe(0);
    expect(w.pending).toBe(true);
    w.phase("review");
    expect(relaunches()).toBe(0);
    w.phase("attract");
    w.phase("attract");
    expect(relaunches()).toBe(1);
  });
});
