import { describe, expect, it } from "vitest";
import { byHour, decodeWidth, hourCursor, hourOf, nextCursor, reprintLeft } from "./gallery";
import type { SessionPiece } from "./platform";

const piece = (completedAt: string): SessionPiece => ({
  sessionId: completedAt,
  path: "p",
  full: "f",
  completedAt,
  layoutId: "l",
  printCount: 1,
  reprinted: 0,
});

describe("galeri tamu (#145)", () => {
  it("batas cetak ulang: sisa = maxPrints − sudah dicetak lagi, tidak pernah negatif", () => {
    expect(reprintLeft(2, 0)).toBe(2);
    expect(reprintLeft(2, 1)).toBe(1);
    expect(reprintLeft(2, 2)).toBe(0);
    expect(reprintLeft(2, 5)).toBe(0);
  });

  it("paging: halaman penuh → kursor = completedAt terakhir; halaman pendek = habis", () => {
    const page = [piece("2026-10-04T10:05:00.000Z"), piece("2026-10-04T10:01:00.000Z")];
    expect(nextCursor(page, 2)).toBe("2026-10-04T10:01:00.000Z");
    expect(nextCursor(page, 3)).toBeNull();
    expect(nextCursor([], 3)).toBeNull();
  });

  it("chip jam: kursor tepat setelah jam itu, kelompok per jam berurutan", () => {
    expect(hourCursor("2026-10-04T10")).toBe("2026-10-04T11:00:00.000Z");
    expect("2026-10-04T10:59:59.999Z" < hourCursor("2026-10-04T10")).toBe(true);
    expect(hourOf("2026-10-04T10:59:59.999Z")).toBe("2026-10-04T10");
    const groups = byHour([
      piece("2026-10-04T11:02:00.000Z"),
      piece("2026-10-04T10:30:00.000Z"),
      piece("2026-10-04T10:10:00.000Z"),
    ]);
    expect(groups.map((g) => [g.hour, g.pieces.length])).toEqual([
      ["2026-10-04T11", 1],
      ["2026-10-04T10", 2],
    ]);
  });

  it("lebar decode: 2× piksel layar sebenarnya, tidak memperbesar file kecil", () => {
    expect(decodeWidth(160, 1, 1, 1200)).toBe(320);
    expect(decodeWidth(160, 0.711, 2, 1200)).toBe(456);
    expect(decodeWidth(160, 1, 2, 400)).toBe(400);
  });
});
