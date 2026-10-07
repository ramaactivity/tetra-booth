import { describe, expect, it } from "vitest";
import { applyGuestPreset, GUEST_PRESETS, guestPreset, stampText } from "./guest-presets";

const img = (w: number, h: number, v: number) => new Uint8ClampedArray(w * h * 4).fill(v);

describe("preset Guest Cam", () => {
  it("Original tidak mengubah piksel; id tak dikenal = Original", () => {
    const d = img(3, 3, 120);
    applyGuestPreset(d, 3, 3, guestPreset("original"));
    expect([...d.slice(0, 4)]).toEqual([120, 120, 120, 120]);
    expect(guestPreset("nope").id).toBe("original");
  });
  it("vignette menggelapkan tepi, tengah tetap", () => {
    const d = img(5, 5, 200);
    applyGuestPreset(d, 5, 5, { ...guestPreset("original"), vignette: 0.5 }, () => 0.5);
    const at = (x: number, y: number) => d[(y * 5 + x) * 4] ?? 0;
    expect(at(2, 2)).toBe(200);
    expect(at(0, 0)).toBeLessThan(at(1, 1));
  });
  it("Mono menghasilkan abu-abu; nama preset bahasa Inggris & unik", () => {
    const d = new Uint8ClampedArray([255, 0, 0, 255]);
    applyGuestPreset(d, 1, 1, { ...guestPreset("mono"), grain: 0 }, () => 0.5);
    expect(d[0]).toBe(d[1]);
    expect(d[1]).toBe(d[2]);
    expect(new Set(GUEST_PRESETS.map((p) => p.name)).size).toBe(GUEST_PRESETS.length);
  });
  it("stempel tanggal gaya kamera sekali pakai", () => {
    expect(stampText(new Date(2026, 9, 7))).toBe("'26 10 07");
  });
});
