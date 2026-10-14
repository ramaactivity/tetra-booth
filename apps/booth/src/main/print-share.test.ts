import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { ServiceUnavailable } from "./camera-client";
import { checkHub, createHubClient, findHubs, startPrintHub } from "./print-share";

const FIND_PORT = 47_991;
const until = async (ok: () => boolean) => {
  for (let i = 0; i < 50 && !ok(); i++) await new Promise((r) => setTimeout(r, 20));
};

describe("printer bersama (#261)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "print-share-"));
  const printed: { jobId: string; copies: number; paper: string; from: string }[] = [];
  const hub = startPrintHub({
    id: "hub1",
    key: "1234",
    name: () => "Operator",
    inbox: join(dir, "inbox"),
    has: (id) => printed.some((p) => p.jobId === id),
    print: async (j) => {
      printed.push({ jobId: j.jobId, copies: j.copies, paper: j.paper, from: j.from });
    },
    status: () => ({
      printer: { status: "ready" },
      paper: { remaining: 300, capacity: 400 },
      tone: null,
    }),
    log: () => {},
    port: 0,
    findPort: FIND_PORT,
  });
  afterAll(() => hub.close());
  await until(() => hub.port() !== null);
  const url = `http://127.0.0.1:${hub.port()}`;
  const sheet = join(dir, "strip.jpg");
  await writeFile(sheet, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]));

  it("booth menemukan laptop printer lewat siaran UDP", async () => {
    const found = await findHubs(400, ["127.0.0.1"], FIND_PORT);
    expect(found).toEqual([{ id: "hub1", name: "Operator", url }]);
  });

  it("kode salah ditolak, kode benar membalas status", async () => {
    expect(await checkHub(url, "9999", "Booth A")).toBe("badkey");
    const st = await checkHub(url, "1234", "Booth A");
    expect(st && st !== "badkey" && st.paper.remaining).toBe(300);
    expect(hub.peers().map((p) => p.name)).toContain("Booth A");
  });

  it("kirim ulang job yang sama tidak mencetak dua kali", async () => {
    const c = createHubClient({
      hub: { id: "hub1", name: "Operator", key: "1234", url },
      from: () => "Garden ✿",
      log: () => {},
    });
    const job = { jobId: "01JX-abc", path: sheet, copies: 2, paper: "2x6x2" as const };
    await c.submit(job);
    await c.submit(job);
    expect(printed).toEqual([
      { jobId: "lan-01JX-abc", copies: 2, paper: "2x6x2", from: "Garden ✿" },
    ]);
  });

  it("laptop printer tidak terjangkau = antre (ServiceUnavailable), kode salah = gagal", async () => {
    const off = createHubClient({
      hub: { id: "hub1", name: "Operator", key: "1234", url: "http://127.0.0.1:1" },
      from: () => "Booth B",
      log: () => {},
      find: async () => [],
    });
    const job = { jobId: "x1", path: sheet, copies: 1, paper: "4R" as const };
    await expect(off.submit(job)).rejects.toBeInstanceOf(ServiceUnavailable);
    const bad = createHubClient({
      hub: { id: "hub1", name: "Operator", key: "0000", url },
      from: () => "Booth B",
      log: () => {},
    });
    const e = await bad.submit(job).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(ServiceUnavailable);
  });

  it("IP laptop printer berubah: booth mencarinya lagi lewat id", async () => {
    const c = createHubClient({
      hub: { id: "hub1", name: "Operator", key: "1234", url: "http://127.0.0.1:1" },
      from: () => "Booth C",
      log: () => {},
      find: () => findHubs(300, ["127.0.0.1"], FIND_PORT),
    });
    expect(await c.poll()).toBeNull();
    expect(c.url()).toBe(url);
    expect((await c.poll()) !== null).toBe(true);
  });
});
