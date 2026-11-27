import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
process.env.R2_ACCOUNT_ID = "acc";
process.env.R2_ACCESS_KEY_ID = "id";
process.env.R2_SECRET_ACCESS_KEY = "secret";
process.env.R2_BUCKET = "b";

describe("presignGet stabil per jam", () => {
  it("URL sama dalam satu jam, berganti di jam berikutnya, tetap berlaku ≥ expiresIn", async () => {
    const { presignGet, stableSign } = await import("./r2");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T10:05:00Z"));
    const a = await presignGet("x.jpg", 3600);
    vi.setSystemTime(new Date("2026-11-27T10:55:00Z"));
    const b = await presignGet("x.jpg", 3600);
    vi.setSystemTime(new Date("2026-11-27T11:01:00Z"));
    const c = await presignGet("x.jpg", 3600);
    vi.useRealTimers();
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    // Ditandatangani 10.00, berlaku 2 jam → sampai 12.00 ≥ 10.55 + 1 jam.
    const s = stableSign(3600, Date.parse("2026-11-27T10:55:00Z"));
    expect(s.signingDate.getTime() + s.expiresIn * 1000).toBeGreaterThanOrEqual(
      Date.parse("2026-11-27T11:55:00Z"),
    );
  });
});
