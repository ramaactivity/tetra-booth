import { describe, expect, it } from "vitest";
import { createRunQueue, type RunPost } from "./run-queue";

const EV = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const memKv = () => {
  const m = new Map<string, string>();
  return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
};

describe("antrean timer event booth", () => {
  it("offline: aksi tersimpan dengan jam saat ditekan, terkirim berurutan saat online", async () => {
    const kv = memKv();
    let online = false;
    const sent: { action: string; at: string }[] = [];
    const post: RunPost = async (_p, body) => {
      if (!online) throw new Error("offline");
      const b = body as { action: string; at: string };
      sent.push(b);
      return { status: 200, body: { state: b.action === "pause" ? "paused" : "running" } };
    };
    let t = Date.parse("2026-10-04T03:00:00.000Z");
    const q = createRunQueue({ kv, post, log: () => {}, now: () => t });
    expect(q.push(EV, "open")).toBe("running");
    t += 60 * 60_000;
    expect(q.push(EV, "pause")).toBe("paused");
    await q.drain();
    expect(q.pending()).toBe(2);
    online = true;
    t += 5 * 60 * 60_000; // terkirim 5 jam kemudian, jam aksi tetap
    await q.drain();
    expect(q.pending()).toBe(0);
    expect(sent).toEqual([
      expect.objectContaining({ action: "open", at: "2026-10-04T03:00:00.000Z" }),
      expect.objectContaining({ action: "pause", at: "2026-10-04T04:00:00.000Z" }),
    ]);
    expect(q.state(EV)).toBe("paused");
  });

  it("buka untuk tamu saat sudah berjalan tidak dikirim lagi; 404 dibuang", async () => {
    const kv = memKv();
    const post: RunPost = async () => ({ status: 404, body: { error: "not_found" } });
    const q = createRunQueue({ kv, post, log: () => {} });
    q.push(EV, "open");
    await q.drain();
    expect(q.pending()).toBe(0);
    expect(q.push(EV, "open")).toBe("running");
    expect(q.pending()).toBe(0);
    expect(q.push(EV, "finish")).toBe("finished");
    expect(q.push(EV, "open")).toBe("finished");
  });
});
