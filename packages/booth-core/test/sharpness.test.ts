import { describe, expect, it } from "vitest";
import { blurReference, isBlurry, laplacianVariance, sharpStore } from "../src/sharpness";

/** Papan catur `w`×`h` (tepi tajam) dan versinya yang di-blur box 5×5. */
const checker = (w: number, h: number) =>
  Float32Array.from({ length: w * h }, (_, i) =>
    (((i % w) >> 3) + (Math.floor(i / w) >> 3)) % 2 ? 255 : 0,
  );
const blur = (src: Float32Array, w: number, h: number, r = 2) =>
  Float32Array.from({ length: w * h }, (_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    let s = 0;
    let n = 0;
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) {
          s += src[yy * w + xx] ?? 0;
          n++;
        }
      }
    return s / n;
  });

describe("ketajaman (DECISIONS #88)", () => {
  it("foto tajam berskor jauh lebih tinggi dari versi buramnya; bidang rata = 0", () => {
    const sharp = checker(96, 64);
    const a = laplacianVariance(sharp, 96, 64);
    const b = laplacianVariance(blur(sharp, 96, 64), 96, 64);
    expect(a).toBeGreaterThan(b * 3);
    expect(laplacianVariance(new Float32Array(96 * 64).fill(128), 96, 64)).toBe(0);
  });

  it("patokan: Tes Jepret dulu, lalu median ≥ 6 foto; di bawah 60% = mungkin buram", () => {
    expect(blurReference(null, [100, 120])).toBeNull();
    expect(blurReference(null, [100, 200, 150, 160, 140, 170])).toBe(155);
    expect(blurReference(250, [100, 100, 100, 100, 100, 100])).toBe(250);
    expect(isBlurry(140, 250)).toBe(true);
    expect(isBlurry(160, 250)).toBe(false);
    expect(isBlurry(10, null)).toBe(false);
  });

  it("peringatan crew saat ≥ 2 dari 3 sesi terakhir buram; bisa ditutup", () => {
    const m = new Map<string, string>();
    const st = sharpStore({
      getItem: (k) => m.get(k) ?? null,
      setItem: (k, v) => void m.set(k, v),
    });
    st.recordSession([200, 210], false);
    st.recordSession([90], true);
    expect(st.crewWarning()).toBe(false);
    st.recordSession([95], true);
    expect(st.crewWarning()).toBe(true);
    st.dismissWarning();
    expect(st.crewWarning()).toBe(false);
    st.setBaseline("ev1", 300);
    expect(st.reference("ev1")).toBe(300);
  });
});
