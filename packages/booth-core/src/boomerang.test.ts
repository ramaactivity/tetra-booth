import { describe, expect, it } from "vitest";
import { BOOMERANG, BOOMERANG_FRAMES, BoomerangClips, boomerangMs, pingPong } from "./boomerang";

/** Frame live view tiap `every` ms dari `from` sampai `to`; isi frame = waktunya. */
const feed = (c: BoomerangClips<number>, from: number, to: number, every: number) => {
  for (let t = from; t <= to; t += every) c.offer(t, () => t);
};

describe("boomerang", () => {
  it("maju-mundur tanpa frame ujung ganda", () => {
    expect(pingPong([1, 2, 3, 4])).toEqual([1, 2, 3, 4, 3, 2]);
    expect(pingPong([1, 2])).toEqual([1, 2]);
    expect(pingPong([])).toEqual([]);
  });

  it("parameter encode: 15 fps, 1 dtk sebelum jepret, 720×405, ±2 s per foto", () => {
    expect(BOOMERANG_FRAMES).toBe(15);
    expect(BOOMERANG.width / BOOMERANG.height).toBeCloseTo(16 / 9, 2);
    expect(boomerangMs(pingPong(Array(BOOMERANG_FRAMES).fill(0)).length)).toBe(1867);
  });

  it("sumber 30 fps disampel 15 fps, hanya 1 detik terakhir sebelum jepret", () => {
    const c = new BoomerangClips<number>();
    feed(c, 0, 3000, 1000 / 30); // hitung mundur 3 dtk
    c.freeze(0);
    const seq = c.sequence();
    const fwd = seq.slice(0, BOOMERANG_FRAMES);
    expect(fwd).toHaveLength(15);
    expect(fwd[0]).toBeGreaterThan(1900);
    expect(fwd.at(-1)).toBeGreaterThan(2900);
    for (const [i, t] of fwd.slice(1).entries()) expect(t - (fwd[i] ?? 0)).toBeCloseTo(66.7, 0);
    expect(seq).toEqual(pingPong(fwd));
  });

  it("klip per foto urut nomor foto; ulang foto menggantikan klipnya, slot lama dilepas", () => {
    const dropped: number[] = [];
    const c = new BoomerangClips<number>((x) => dropped.push(x), 3, 10);
    feed(c, 0, 500, 100);
    c.freeze(1);
    feed(c, 1000, 1500, 100);
    c.freeze(0);
    expect(c.sequence()).toEqual([1300, 1400, 1500, 1400, 300, 400, 500, 400]);
    feed(c, 2000, 2200, 100); // ulang foto 2
    c.freeze(1);
    expect(c.sequence()).toEqual([1300, 1400, 1500, 1400, 2000, 2100, 2200, 2100]);
    expect(dropped).toEqual(expect.arrayContaining([300, 400, 500]));
  });

  it("slot tertua dipakai ulang saat ring penuh (tanpa alokasi baru)", () => {
    const reused: (number | undefined)[] = [];
    const c = new BoomerangClips<number>(undefined, 2, 10);
    for (const t of [0, 100, 200, 300])
      c.offer(t, (r) => {
        reused.push(r);
        return t;
      });
    expect(reused).toEqual([undefined, undefined, 0, 100]);
  });

  it("tanpa frame (kamera tanpa live view) = tanpa klip", () => {
    const c = new BoomerangClips<number>();
    c.offer(0, () => 0);
    c.freeze(0);
    expect(c.sequence()).toEqual([]);
  });
});
