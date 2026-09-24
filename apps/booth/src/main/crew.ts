import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { type EventBundle, EventBundleSchema } from "@tetra/shared";

/** PIN crew 4–6 digit (FSD §1.3). Disimpan sebagai scrypt(salt) di kv, tidak pernah plaintext. */
export const PIN_PATTERN = /^\d{4,6}$/;
export const MAX_PIN_FAILURES = 5;
export const LOCK_MS = 60_000;

export const hashPin = (pin: string): string => {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pin, salt, 32).toString("hex")}`;
};

export const checkPin = (pin: string, stored: string): boolean => {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(pin, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
};

/** Penjaga PIN dengan kunci sementara setelah 5x salah. Jam disuntik supaya bisa dites. */
export function createPinGuard(
  store: { get(): string | null; set(v: string): void },
  now = () => Date.now(),
) {
  let failures = 0;
  let lockedUntil = 0;
  let unlocked = false;
  const locked = () => (now() < lockedUntil ? lockedUntil : null);
  return {
    status: () => ({ hasPin: store.get() !== null, lockedUntil: locked() }),
    verify(pin: string) {
      if (locked()) return { ok: false, lockedUntil: locked() };
      const stored = store.get();
      const ok = stored !== null && PIN_PATTERN.test(pin) && checkPin(pin, stored);
      if (ok) {
        failures = 0;
        unlocked = true;
      } else if (++failures >= MAX_PIN_FAILURES) {
        failures = 0;
        lockedUntil = now() + LOCK_MS;
      }
      return { ok, lockedUntil: locked() };
    },
    /** Buat PIN pertama kali, atau ganti setelah crew masuk. */
    set(pin: string) {
      if (!PIN_PATTERN.test(pin)) throw new Error("PIN harus 4–6 digit");
      if (store.get() !== null && !unlocked)
        throw new Error("masuk mode crew dulu untuk mengganti PIN");
      store.set(hashPin(pin));
      unlocked = true;
    },
    lock: () => {
      unlocked = false;
    },
    get unlocked() {
      return unlocked;
    },
  };
}

export type LoadedBundle = EventBundle & { dir: string };

/** Baca semua `events/*\/bundle/config.json`; bundle rusak dilewati dengan log (tidak menghentikan booth). */
export function loadBundles(eventsDir: string, log: (m: string) => void): LoadedBundle[] {
  if (!existsSync(eventsDir)) return [];
  const out: LoadedBundle[] = [];
  for (const name of readdirSync(eventsDir)) {
    const dir = join(eventsDir, name, "bundle");
    const file = join(dir, "config.json");
    if (!existsSync(file)) continue;
    try {
      const b = EventBundleSchema.parse(JSON.parse(readFileSync(file, "utf8")));
      const missing = Object.values(b.assets).filter((f) => !existsSync(join(dir, f)));
      if (missing.length) throw new Error(`file aset tidak ada: ${missing.join(", ")}`);
      out.push({ ...b, dir });
    } catch (e) {
      log(`[events] bundle ${name} dilewati: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return out;
}

/** Path file aset di dalam folder bundle; menolak apa pun di luar folder itu. */
export function assetPath(bundle: LoadedBundle, assetId: string): string {
  const file = bundle.assets[assetId];
  if (!file) throw new Error(`aset ${assetId} tidak ada di bundle ${bundle.id}`);
  const abs = resolve(bundle.dir, file);
  if (!abs.startsWith(resolve(bundle.dir) + sep)) throw new Error("path aset di luar bundle");
  return abs;
}
