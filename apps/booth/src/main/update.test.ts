import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
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

describe("downloadInstaller versi baru terbit di tengah unduhan", () => {
  it("tidak menyambung .part versi lama dengan file lain: berhenti & buang .part", async () => {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/setup.exe`;
    ranges.length = 0; // permintaan pertama diputus lagi di tengah
    const dir = mkdtempSync(join(tmpdir(), "tb-upd-"));
    let calls = 0;
    await expect(
      downloadInstaller(
        async () => ({
          version: ++calls === 1 ? "9.9.9" : "9.9.10",
          key: "k",
          sha256: sha,
          size: body.length,
          url,
        }),
        dir,
        () => {},
      ),
    ).rejects.toThrow(/versi 9\.9\.10 terbit/);
    expect(existsSync(join(dir, "Tetra-Booth-Setup-9.9.9.exe.part"))).toBe(false);
  });
});

describe("downloadInstaller paralel (#106)", () => {
  it("4 bagian Range bersamaan; bagian yang putus dilanjutkan; hasil gabungan utuh", async () => {
    const { PARALLEL } = await import("./update");
    Object.assign(PARALLEL, { minSize: 1_000_000 });
    const data = Buffer.alloc(4_000_000);
    for (let i = 0; i < data.length; i++) data[i] = (i * 7) % 251;
    const hash = createHash("sha256").update(data).digest("hex");
    const seen: string[] = [];
    let cut = false;
    const srv = createServer((req, res) => {
      const m = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? "");
      if (!m) return res.writeHead(400).end();
      seen.push(req.headers.range ?? "");
      const [a, b] = [Number(m[1]), Number(m[2]) + 1];
      res.writeHead(206, { "content-length": b - a });
      // Bagian ke-3 putus sekali di tengah.
      if (a === 2_000_000 && !cut) {
        cut = true;
        res.write(data.subarray(a, a + 300_000), () => res.destroy());
        return;
      }
      res.end(data.subarray(a, b));
    });
    await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/p.exe`;
    const dir = mkdtempSync(join(tmpdir(), "tb-par-"));
    const file = await downloadInstaller(
      async () => ({ version: "9.9.7", key: "k", sha256: hash, size: data.length, url }),
      dir,
      () => {},
    );
    srv.close();
    Object.assign(PARALLEL, { minSize: 16_000_000 });
    expect(readFileSync(file).equals(data)).toBe(true);
    expect(seen.slice(0, 4).sort()).toEqual(
      [
        "bytes=0-999999",
        "bytes=1000000-1999999",
        "bytes=2000000-2999999",
        "bytes=3000000-3999999",
      ].sort(),
    );
    // Bagian ke-3 dilanjutkan dari byte yang sudah diterima (bukan dari awal bagian).
    const resume = seen.slice(4).map((x) => Number(/^bytes=(\d+)-2999999$/.exec(x)?.[1]));
    expect(resume).toHaveLength(1);
    expect(resume[0]).toBeGreaterThan(2_000_000);
    expect(resume[0]).toBeLessThanOrEqual(2_300_000);
    expect(existsSync(`${file}.part0`)).toBe(false);
  });
});
