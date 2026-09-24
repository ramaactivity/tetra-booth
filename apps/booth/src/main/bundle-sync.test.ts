import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { installBundle } from "./bundle-sync";

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const config = (file: string) => ({
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "Uji",
  date: "1 Januari 2027",
  layout: {
    id: "l",
    version: 1,
    paper: "4R",
    canvas: { width: 1200, height: 1800, dpi: 300 },
    slots: [{ id: "a", x: 0, y: 0, w: 100, h: 100, fit: "cover", z: "below_overlay" }],
    overlay: { assetId: "ov" },
    texts: [],
  },
  assets: { ov: file },
});
const manifest = (file: string, body: string) => ({
  bundleVersion: 1,
  config: config(file),
  files: [{ file, sha256: hash(body), url: `https://m/${body}` }],
});

describe("installBundle (N3)", () => {
  it("unduh, cek hash, ganti bundle; file dengan hash sama tidak diunduh ulang", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tb-bundle-"));
    const got: string[] = [];
    const dl = async (url: string) => {
      got.push(url);
      return new TextEncoder().encode(url.slice("https://m/".length));
    };
    await installBundle(dir, manifest("a.png", "A"), dl);
    expect(readFileSync(join(dir, "bundle", "a.png"), "utf8")).toBe("A");
    expect(JSON.parse(readFileSync(join(dir, "bundle", "config.json"), "utf8")).name).toBe("Uji");
    await installBundle(dir, manifest("a.png", "A"), dl);
    expect(got).toEqual(["https://m/A"]);
  });

  it("hash tidak cocok → gagal, bundle lama tetap", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tb-bundle-"));
    await installBundle(dir, manifest("a.png", "A"), async () => new TextEncoder().encode("A"));
    await expect(
      installBundle(dir, manifest("a.png", "B"), async () => new TextEncoder().encode("rusak")),
    ).rejects.toThrow(/hash/);
    expect(readFileSync(join(dir, "bundle", "a.png"), "utf8")).toBe("A");
  });
});
