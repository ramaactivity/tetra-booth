import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildEventFolder, folderName } from "./event-folder";

describe("folder event", () => {
  it("nama aman Windows", () => {
    expect(folderName('Andi & Sari: "Wedding"?. ')).toBe("Andi & Sari- -Wedding--");
  });
  it("kumpulkan file per jenis, dibuka ulang tidak menggandakan", async () => {
    const src = mkdtempSync(join(tmpdir(), "tb-src-"));
    const dest = join(mkdtempSync(join(tmpdir(), "tb-dst-")), "Event");
    writeFileSync(join(src, "strip.jpg"), "s");
    writeFileSync(join(src, "0.jpg"), "o");
    const at = "2026-10-04T01:12:05.000Z";
    const files = [
      {
        sessionId: "abc",
        startedAt: at,
        kind: "strip" as const,
        idx: 0,
        path: join(src, "strip.jpg"),
      },
      {
        sessionId: "abc",
        startedAt: at,
        kind: "original" as const,
        idx: 0,
        path: join(src, "0.jpg"),
      },
      {
        sessionId: "abc",
        startedAt: at,
        kind: "original" as const,
        idx: 1,
        path: join(src, "x.jpg"),
      },
    ];
    expect(await buildEventFolder(dest, files)).toBe(2);
    expect(await buildEventFolder(dest, files)).toBe(0);
    expect(readdirSync(dest).sort()).toEqual(["Cetak", "Foto asli"]);
    expect(readdirSync(join(dest, "Foto asli"))[0]).toMatch(
      /^2026-10-04 \d{2}\.12\.05 abc-1\.jpg$/,
    );
  });
});
