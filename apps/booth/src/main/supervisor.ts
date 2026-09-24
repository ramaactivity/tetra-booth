import type { ChildProcess } from "node:child_process";

/**
 * Supervisor Camera Service (TSD §1): jalankan, cek health tiap 5 detik, restart kalau proses mati
 * atau health gagal 3x berturut-turut. Logika murni dengan dependensi yang disuntik, supaya bisa dites.
 */

export const HEALTH_EVERY_MS = 5000;
export const MAX_HEALTH_FAILURES = 3;
const RESTART_BACKOFF_MS = [500, 1000, 2000, 5000, 10000];

export type SupervisorDeps = {
  spawn: () => ChildProcess;
  health: () => Promise<unknown>;
  log: (msg: string) => void;
  healthEveryMs?: number;
  backoffMs?: number[];
};

export function createSupervisor(d: SupervisorDeps) {
  const every = d.healthEveryMs ?? HEALTH_EVERY_MS;
  const backoff = d.backoffMs ?? RESTART_BACKOFF_MS;
  let child: ChildProcess | null = null;
  let failures = 0;
  /** Restart berturut-turut tanpa health OK; menentukan jeda backoff. */
  let streak = 0;
  let restarts = 0;
  let stopped = false;
  let healthTimer: ReturnType<typeof setInterval> | undefined;
  let restartTimer: ReturnType<typeof setTimeout> | undefined;

  const start = () => {
    if (stopped) return;
    const c = d.spawn();
    child = c;
    failures = 0;
    d.log(`[supervisor] Camera Service start (pid ${c.pid ?? "?"})`);
    c.once("exit", (code, signal) => {
      if (child !== c) return;
      child = null;
      if (stopped) return;
      d.log(`[supervisor] Camera Service berhenti (code ${code ?? "-"}, signal ${signal ?? "-"})`);
      scheduleRestart();
    });
    c.once("error", (e) => d.log(`[supervisor] gagal menjalankan Camera Service: ${e.message}`));
  };

  const scheduleRestart = () => {
    if (stopped || restartTimer) return;
    const wait = backoff[Math.min(streak, backoff.length - 1)] ?? 1000;
    streak++;
    restarts++;
    restartTimer = setTimeout(() => {
      restartTimer = undefined;
      start();
    }, wait);
  };

  const check = async () => {
    if (stopped || !child) return;
    try {
      await d.health();
      failures = 0;
      streak = 0;
    } catch {
      failures++;
      if (failures >= MAX_HEALTH_FAILURES && child) {
        d.log(`[supervisor] health gagal ${failures}x, restart Camera Service`);
        const c = child;
        child = null;
        c.kill();
        scheduleRestart();
      }
    }
  };

  return {
    start() {
      start();
      healthTimer = setInterval(() => void check(), every);
    },
    stop() {
      stopped = true;
      clearInterval(healthTimer);
      clearTimeout(restartTimer);
      child?.kill();
      child = null;
    },
    get restarts() {
      return restarts;
    },
    get running() {
      return child !== null;
    },
  };
}
