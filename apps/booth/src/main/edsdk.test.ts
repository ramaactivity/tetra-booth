import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ensureEdsdk } from "./edsdk";

const files = {
  "EDSDK.dll": Buffer.from("edsdk-palsu"),
  "EdsImage.dll": Buffer.from("edsimage-palsu"),
};
const server = createServer((req, res) => {
  const name = req.url?.slice(1) as keyof typeof files;
  res.end(files[name] ?? "");
});
afterAll(() => server.close());
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const manifest = async (bad = false) => {
  if (!server.listening) await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;
  return {
    version: "13.20.21",
    files: (Object.keys(files) as (keyof typeof files)[]).map((name) => ({
      name,
      size: files[name].length,
      sha256: bad && name === "EdsImage.dll" ? "0".repeat(64) : sha(files[name]),
      url: `http://127.0.0.1:${port}/${name}`,
    })),
  };
};

describe("ensureEdsdk (#112)", () => {
  it("DLL belum ada → unduh dari cloud, cocokkan sha256, simpan", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "tb-eds-")), "edsdk");
    expect(
      await ensureEdsdk(
        dir,
        () => manifest(),
        () => {},
      ),
    ).toBe(true);
    expect(readFileSync(join(dir, "EDSDK.dll")).equals(files["EDSDK.dll"])).toBe(true);
    expect(readFileSync(join(dir, "EdsImage.dll")).equals(files["EdsImage.dll"])).toBe(true);
  });
  it("sha256 tidak cocok → false, file rusak tidak disimpan", async () => {
    const dir = join(mkdtempSync(join(tmpdir(), "tb-eds-")), "edsdk");
    expect(
      await ensureEdsdk(
        dir,
        () => manifest(true),
        () => {},
      ),
    ).toBe(false);
    expect(existsSync(join(dir, "EdsImage.dll"))).toBe(false);
  });
  it("sudah ada → tidak mengambil manifest; offline/belum dipasangkan → false tanpa melempar", async () => {
    const dir = mkdtempSync(join(tmpdir(), "tb-eds-"));
    for (const n of Object.keys(files)) writeFileSync(join(dir, n), "x");
    let called = false;
    expect(
      await ensureEdsdk(
        dir,
        async () => {
          called = true;
          return null;
        },
        () => {},
      ),
    ).toBe(true);
    expect(called).toBe(false);
    const empty = join(mkdtempSync(join(tmpdir(), "tb-eds-")), "edsdk");
    expect(
      await ensureEdsdk(
        empty,
        () => Promise.reject(new Error("booth belum dipasangkan")),
        () => {},
      ),
    ).toBe(false);
  });
});
