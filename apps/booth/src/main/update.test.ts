import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { downloadInstaller } from "./update";

// Installer palsu 3 MB; permintaan pertama diputus di tengah, berikutnya melayani Range (206).
const body = Buffer.alloc(3_000_000, 7);
body.write("TETRA", 1234);
const sha = createHash("sha256").update(body).digest("hex");
const ranges: (string | undefined)[] = [];
const server = createServer((req, res) => {
  ranges.push(req.headers.range);
  const m = /^bytes=(\d+)-$/.exec(req.headers.range ?? "");
  if (ranges.length === 1) {
    res.writeHead(200, { "content-length": body.length });
    res.write(body.subarray(0, 1_000_000), () => res.destroy());
    return;
  }
  const from = m ? Number(m[1]) : 0;
  res.writeHead(m ? 206 : 200, { "content-length": body.length - from });
  res.end(body.subarray(from));
});
afterAll(() => server.close());

describe("downloadInstaller (#89)", () => {
  it("lanjut dari byte terakhir setelah putus, cek sha256, laporkan progress", async () => {
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/setup.exe`;
    const seen: number[] = [];
    const file = await downloadInstaller(
      async () => ({ version: "9.9.9", key: "k", sha256: sha, size: body.length, url }),
      mkdtempSync(join(tmpdir(), "tb-upd-")),
      (p) => seen.push(p.received),
    );
    expect(readFileSync(file).equals(body)).toBe(true);
    expect(ranges[0]).toBeUndefined();
    expect(ranges[1]).toMatch(/^bytes=\d+-$/);
    expect(Number(ranges[1]?.slice(6, -1))).toBeGreaterThan(0);
    expect(seen.at(-1)).toBe(body.length);
  });
});

describe("downloadInstaller koneksi lambat (W-032)", () => {
  it("koneksi pertama pelan → diputus lalu lanjut dengan Range di koneksi baru", async () => {
    const { SLOW } = await import("./update");
    Object.assign(SLOW, { ms: 300, bps: 2_000_000 });
    const data = Buffer.alloc(2_000_000, 3);
    const hash = createHash("sha256").update(data).digest("hex");
    const seen: (string | undefined)[] = [];
    const slow = createServer((req, res) => {
      seen.push(req.headers.range);
      const m = /^bytes=(\d+)-$/.exec(req.headers.range ?? "");
      const from = m ? Number(m[1]) : 0;
      res.writeHead(m ? 206 : 200, { "content-length": data.length - from });
      if (seen.length > 1) return res.end(data.subarray(from));
      // Koneksi pertama: 32 KB tiap 100 ms (±320 KB/s).
      let at = from;
      const t = setInterval(() => {
        if (res.destroyed || at >= data.length) return clearInterval(t);
        res.write(data.subarray(at, at + 32_000));
        at += 32_000;
      }, 100);
      res.on("close", () => clearInterval(t));
    });
    await new Promise<void>((ok) => slow.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${(slow.address() as AddressInfo).port}/s.exe`;
    const file = await downloadInstaller(
      async () => ({ version: "9.9.8", key: "k", sha256: hash, size: data.length, url }),
      mkdtempSync(join(tmpdir(), "tb-slow-")),
      () => {},
    );
    slow.close();
    expect(readFileSync(file).equals(data)).toBe(true);
    expect(seen[0]).toBeUndefined();
    expect(seen[1]).toMatch(/^bytes=[1-9]\d*-$/);
  });
});
