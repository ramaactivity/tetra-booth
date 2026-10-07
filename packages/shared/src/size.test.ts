import { describe, expect, it } from "vitest";
import { fileSize, LocalStorage } from "./size";

describe("fileSize", () => {
  it("format Indonesia basis 1024", () => {
    expect(fileSize(0)).toBe("0 B");
    expect(fileSize(500)).toBe("500 B");
    expect(fileSize(12 * 1024)).toBe("12 KB");
    expect(fileSize(850 * 1024 ** 2)).toBe("850 MB");
    expect(fileSize(2.5 * 1024 ** 2)).toBe("2,5 MB");
    expect(fileSize(3.2 * 1024 ** 3)).toBe("3,2 GB");
    expect(fileSize(16 * 1024 ** 3)).toBe("16 GB");
    expect(fileSize(1.5 * 1024 ** 4)).toBe("1,5 TB");
  });
  it("LocalStorage menolak angka negatif / pecahan", () => {
    expect(LocalStorage.safeParse({ bytes: 10, files: 1 }).success).toBe(true);
    expect(LocalStorage.safeParse({ bytes: -1, files: 1 }).success).toBe(false);
    expect(LocalStorage.safeParse({ bytes: 1.5, files: 1 }).success).toBe(false);
  });
});
