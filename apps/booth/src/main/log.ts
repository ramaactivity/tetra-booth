import { appendFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { format } from "node:util";

export const LOG_KEEP_DAYS = 14;

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Hapus log harian `YYYY-MM-DD.log` yang lebih tua dari `keepDays`. */
export function pruneLogs(dir: string, now: Date, keepDays = LOG_KEEP_DAYS): string[] {
  const cutoff = day(new Date(now.getTime() - keepDays * 86_400_000));
  const old = readdirSync(dir).filter(
    (f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f) && f.slice(0, 10) < cutoff,
  );
  for (const f of old) rmSync(join(dir, f));
  return old;
}

/**
 * Log lokal rotasi harian (TSD §3): console main di-tee ke `logs/YYYY-MM-DD.log`.
 * Log renderer diteruskan lewat `write` (dipanggil dari handler console-message).
 */
export function setupLogging(dir: string) {
  mkdirSync(dir, { recursive: true });
  pruneLogs(dir, new Date());
  const write = (level: string, msg: string) => {
    const now = new Date();
    try {
      appendFileSync(join(dir, `${day(now)}.log`), `${now.toISOString()} ${level} ${msg}\n`);
    } catch {
      // Disk penuh/terkunci tidak boleh menghentikan booth.
    }
  };
  for (const level of ["info", "warn", "error"] as const) {
    const orig = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      orig(...args);
      write(level.toUpperCase(), format(...args));
    };
  }
  return write;
}
