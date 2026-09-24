import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupervisor, MAX_HEALTH_FAILURES } from "./supervisor";

class FakeChild extends EventEmitter {
  static n = 0;
  pid = ++FakeChild.n;
  killed = false;
  kill() {
    this.killed = true;
    queueMicrotask(() => this.emit("exit", null, "SIGTERM"));
    return true;
  }
}

describe("supervisor", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (healthy: () => boolean) => {
    const children: FakeChild[] = [];
    const logs: string[] = [];
    const ready: number[] = [];
    const sup = createSupervisor({
      spawn: () => {
        const c = new FakeChild();
        children.push(c);
        return c as unknown as ChildProcess;
      },
      health: () => (healthy() ? Promise.resolve() : Promise.reject(new Error("down"))),
      log: (m) => logs.push(m),
      onReady: (at) => {
        expect(at).toBeGreaterThan(0);
        ready.push(children.length);
      },
      healthEveryMs: 100,
      backoffMs: [10, 20],
    });
    return { sup, children, logs, ready };
  };

  it("proses mati → restart otomatis", async () => {
    const { sup, children } = setup(() => true);
    sup.start();
    expect(children).toHaveLength(1);
    children[0]?.emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(10);
    expect(children).toHaveLength(2);
    expect(sup.restarts).toBe(1);
    sup.stop();
  });

  it(`health gagal ${MAX_HEALTH_FAILURES}x berturut-turut → kill + restart; sekali gagal tidak`, async () => {
    let ok = true;
    const { sup, children } = setup(() => ok);
    sup.start();
    ok = false;
    await vi.advanceTimersByTimeAsync(100 * (MAX_HEALTH_FAILURES - 1));
    expect(children[0]?.killed).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    expect(children[0]?.killed).toBe(true);
    ok = true;
    await vi.advanceTimersByTimeAsync(20);
    expect(children).toHaveLength(2);
    // exit dari proses lama yang di-kill tidak memicu restart kedua
    expect(sup.restarts).toBe(1);
    sup.stop();
  });

  it("20x dibunuh → 20x pulih", async () => {
    const { sup, children } = setup(() => true);
    sup.start();
    for (let i = 0; i < 20; i++) {
      children.at(-1)?.emit("exit", null, "SIGKILL");
      await vi.advanceTimersByTimeAsync(20);
    }
    expect(children).toHaveLength(21);
    expect(sup.running).toBe(true);
    sup.stop();
  });

  it("onReady sekali per start, saat health pertama OK (untuk kirim ulang print)", async () => {
    const { sup, children, ready } = setup(() => true);
    sup.start();
    await vi.advanceTimersByTimeAsync(350);
    expect(ready).toEqual([1]);
    children[0]?.emit("exit", 1, null);
    await vi.advanceTimersByTimeAsync(10 + 100);
    expect(ready).toEqual([1, 2]);
    sup.stop();
  });

  it("stop: tidak ada restart lagi", async () => {
    const { sup, children } = setup(() => true);
    sup.start();
    sup.stop();
    await vi.advanceTimersByTimeAsync(1000);
    expect(children).toHaveLength(1);
    expect(children[0]?.killed).toBe(true);
  });
});
