import { describe, expect, it } from "vitest";
import { createFrameWatch } from "./frame-watch";

const setup = (probe: () => Promise<unknown>, active = () => true) => {
  let t = 0;
  let frozen = 0;
  const w = createFrameWatch({ probe, active, frozen: () => frozen++, now: () => t });
  return {
    frozen: () => frozen,
    step: async (ms: number) => {
      t += ms;
      w.tick();
      await Promise.resolve();
    },
  };
};

describe("frame watch (M-018)", () => {
  it("renderer menggambar → tidak pernah dianggap beku", async () => {
    const s = setup(() => Promise.resolve());
    for (let i = 0; i < 20; i++) await s.step(5000);
    expect(s.frozen()).toBe(0);
  });

  it("tanpa frame > 15 s → frozen sekali saja", async () => {
    const s = setup(() => new Promise(() => {}));
    for (let i = 0; i < 3; i++) await s.step(5000);
    expect(s.frozen()).toBe(0);
    await s.step(5000);
    expect(s.frozen()).toBe(1);
    await s.step(5000);
    expect(s.frozen()).toBe(1);
  });

  it("jendela tidak aktif (minimize/memuat) tidak dihitung", async () => {
    let active = false;
    const s = setup(
      () => new Promise(() => {}),
      () => active,
    );
    for (let i = 0; i < 10; i++) await s.step(5000);
    active = true;
    await s.step(5000);
    expect(s.frozen()).toBe(0);
  });
});
