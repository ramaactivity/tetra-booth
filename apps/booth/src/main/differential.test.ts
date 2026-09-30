import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { assemble, parseBlockmap, planDiff } from "./differential";
import { downloadInstaller } from "./update";

/** Blockmap format electron-builder (gzip JSON) dari potongan berukuran `sizes`. */
const blockmap = (buf: Buffer, sizes: number[]) => {
  let at = 0;
  const checksums = sizes.map((s) => {
    const c = createHash("sha256")
      .update(buf.subarray(at, at + s))
      .digest("base64");
    at += s;
    return c;
  });
  return gzipSync(
    JSON.stringify({ version: "2", files: [{ name: "file", offset: 0, checksums, sizes }] }),
  );
};
const bytes = (n: number, seed: number) => {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = (i * seed + (i >> 8)) % 251;
  return b;
};
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

// Installer lama: potongan A B C D (masing-masing 1000). Baru: A X C D' B (X, D' baru; B pindah ke akhir).
const [A, B, C, D, X, D2] = [1, 2, 3, 4, 5, 6].map((s) => bytes(1000, s)) as Buffer[];
const oldBuf = Buffer.concat([A, B, C, D] as Buffer[]);
const newBuf = Buffer.concat([A, X, C, D2, B] as Buffer[]);
const oldMap = blockmap(oldBuf, [1000, 1000, 1000, 1000]);
const newMap = blockmap(newBuf, [1000, 1000, 1000, 1000, 1000]);

describe("planDiff (#139)", () => {
  it("salin potongan yang sama (checksum + ukuran), unduh sisanya, gabung yang bersambung", () => {
    expect(planDiff(parseBlockmap(oldMap), parseBlockmap(newMap))).toEqual([
      { kind: "copy", from: 0, size: 1000 },
      { kind: "download", from: 1000, size: 1000 },
      { kind: "copy", from: 2000, size: 1000 },
      { kind: "download", from: 3000, size: 1000 },
      { kind: "copy", from: 1000, size: 1000 },
    ]);
    // Dua potongan baru berurutan = satu rentang unduhan; potongan lama berurutan = satu salinan.
    const n2 = Buffer.concat([A, B, X, D2] as Buffer[]);
    expect(
      planDiff(parseBlockmap(oldMap), parseBlockmap(blockmap(n2, [1000, 1000, 1000, 1000]))),
    ).toEqual([
      { kind: "copy", from: 0, size: 2000 },
      { kind: "download", from: 2000, size: 2000 },
    ]);
  });

  it("assemble menyusun file baru dari file lama + rentang unduhan", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tb-diff-"));
    const ops = planDiff(parseBlockmap(oldMap), parseBlockmap(newMap));
    writeFileSync(join(dir, "old"), oldBuf);
    writeFileSync(join(dir, "d0"), X as Buffer);
    writeFileSync(join(dir, "d1"), D2 as Buffer);
    await assemble(ops, join(dir, "old"), [join(dir, "d0"), join(dir, "d1")], join(dir, "out"));
    expect(readFileSync(join(dir, "out")).equals(newBuf)).toBe(true);
  });
});

/** Server rilis: installer baru (Range) + blockmap; `corrupt` = rentang diferensial berisi data salah. */
const serve = async (corrupt: boolean) => {
  const ranges: string[] = [];
  const srv = createServer((req, res) => {
    if (req.url === "/bm") return res.end(newMap);
    const range = req.headers.range ?? "";
    ranges.push(range);
    const m = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!m) return res.writeHead(200, { "content-length": newBuf.length }).end(newBuf);
    const [a, b] = [Number(m[1]), m[2] ? Number(m[2]) + 1 : newBuf.length];
    res.writeHead(206, { "content-length": b - a });
    res.end(corrupt && m[2] ? Buffer.alloc(b - a, 9) : newBuf.subarray(a, b));
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  const release = async () => ({
    version: "1.0.1",
    key: "k",
    sha256: sha(newBuf),
    size: newBuf.length,
    url: `${base}/setup.exe`,
    blockmapUrl: `${base}/bm`,
  });
  return { srv, ranges, release };
};
const cacheWithOld = () => {
  const dir = mkdtempSync(join(tmpdir(), "tb-upd-diff-"));
  writeFileSync(join(dir, "Tetra-Booth-Setup-1.0.0.exe"), oldBuf);
  writeFileSync(join(dir, "Tetra-Booth-Setup-1.0.0.exe.blockmap"), oldMap);
  return dir;
};

describe("downloadInstaller diferensial (#139)", () => {
  it("hanya mengunduh potongan yang berubah; simpan installer + blockmap baru, buang yang lama", async () => {
    const { srv, ranges, release } = await serve(false);
    const dir = cacheWithOld();
    const seen: { received: number; total: number }[] = [];
    const file = await downloadInstaller(release, dir, (p) => seen.push(p));
    srv.close();
    expect(readFileSync(file).equals(newBuf)).toBe(true);
    expect(ranges.sort()).toEqual(["bytes=1000-1999", "bytes=3000-3999"]);
    expect(seen.at(-1)).toEqual({ received: 2000, total: 2000 });
    expect(readFileSync(`${file}.blockmap`).equals(newMap)).toBe(true);
    expect(existsSync(join(dir, "Tetra-Booth-Setup-1.0.0.exe"))).toBe(false);
    expect(existsSync(join(dir, "Tetra-Booth-Setup-1.0.0.exe.blockmap"))).toBe(false);
  });

  it("checksum hasil diferensial salah → unduh penuh", async () => {
    const { srv, ranges, release } = await serve(true);
    const file = await downloadInstaller(release, cacheWithOld(), () => {});
    srv.close();
    expect(readFileSync(file).equals(newBuf)).toBe(true);
    // Rentang diferensial dulu, lalu unduhan penuh satu bagian (tanpa Range).
    expect(ranges.slice(0, 2).sort()).toEqual(["bytes=1000-1999", "bytes=3000-3999"]);
    expect(ranges[2]).toBe("");
  });

  it("tanpa installer lama → unduh penuh, blockmap disimpan untuk update berikutnya", async () => {
    const { srv, ranges, release } = await serve(false);
    const file = await downloadInstaller(release, mkdtempSync(join(tmpdir(), "tb-upd-")), () => {});
    srv.close();
    expect(readFileSync(file).equals(newBuf)).toBe(true);
    expect(ranges).toEqual([""]);
    expect(existsSync(`${file}.blockmap`)).toBe(true);
  });
});
