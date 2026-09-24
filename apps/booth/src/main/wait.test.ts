import { describe, expect, it, vi } from "vitest";
import { waitUntil } from "./wait";

describe("waitUntil (tunggu print selesai saat keluar, M-012)", () => {
  it("selesai begitu kondisi terpenuhi", async () => {
    vi.useFakeTimers();
    let n = 2;
    const p = waitUntil(() => n-- <= 0, 15_000);
    await vi.advanceTimersByTimeAsync(600);
    expect(await p).toBe(true);
    vi.useRealTimers();
  });
  it("menyerah setelah batas waktu", async () => {
    vi.useFakeTimers();
    const p = waitUntil(() => false, 1000);
    await vi.advanceTimersByTimeAsync(1300);
    expect(await p).toBe(false);
    vi.useRealTimers();
  });
});
