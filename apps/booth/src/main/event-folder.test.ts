import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EventFile } from "./db";
import { buildEventFolder, eventFolderSize, folderName, parseDrives } from "./event-folder";

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
  it("ukuran = persis isi folder (jenis sama, file hilang & nama bentrok tidak dihitung)", async () => {
    const src = mkdtempSync(join(tmpdir(), "tb-src-"));
    writeFileSync(join(src, "strip.jpg"), "12345");
    writeFileSync(join(src, "strip2.jpg"), "123456789");
    writeFileSync(join(src, "0.jpg"), "123");
    writeFileSync(join(src, "web.jpg"), "1234567");
    writeFileSync(join(src, "v.mp4"), "12");
    const f = (kind: EventFile["kind"], idx: number, name: string) => ({
      sessionId: "abc",
      startedAt: "2026-10-04T01:12:05.000Z",
      kind,
      idx,
      path: join(src, name),
    });
    const files = [
      f("strip", 0, "strip.jpg"),
      f("strip", 1, "strip2.jpg"), // nama tujuan sama dengan strip pertama → dilewati folder
      f("original", 0, "0.jpg"),
      f("original", 1, "hilang.jpg"),
      f("strip_web", 0, "web.jpg"),
      f("video", 0, "v.mp4"),
    ];
    expect(await eventFolderSize(files)).toEqual({ bytes: 10, files: 3 });
    const dest = join(mkdtempSync(join(tmpdir(), "tb-dst-")), "Event");
    expect(await buildEventFolder(dest, files)).toBe(3);
  });
  it("baca drive removable dari PowerShell", () => {
    expect(parseDrives("E:|1073741824|16000000000\r\nrusak\r\nF:|5|10\r\n")).toEqual([
      { name: "E:", free: 1073741824, total: 16000000000 },
      { name: "F:", free: 5, total: 10 },
    ]);
  });
});
