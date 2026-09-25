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
