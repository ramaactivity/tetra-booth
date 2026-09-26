import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import type { BoothUpdateResponse } from "@tetra/shared";

/** Tanpa data selama ini = koneksi macet → coba lagi, lanjut dari byte terakhir. */
const STALL_MS = 60_000;
const ATTEMPTS = 8;
/**
 * Koneksi yang terjebak di jalur lambat (W-032: 130 KB/s, koneksi baru ke server yang sama 8 MB/s): kalau rata-rata
 * < `slowBps` selama `slowMs` sejak tersambung, putus dan sambung ulang (Range). Tidak dihitung sebagai gagal;
 * paling banyak `SLOW_RESTARTS` kali, setelah itu diterima apa adanya (jaringan memang lambat).
 */
const SLOW_RESTARTS = 10;
export const SLOW = { bps: 500_000, ms: 20_000 };

export type UpdateProgress = { received: number; total: number };

const sha256File = async (file: string) => {
  const h = createHash("sha256");
  await pipeline(createReadStream(file), h);
  return h.digest("hex");
};

/** Installer besar diunduh dalam beberapa bagian sekaligus (Range): data W-032 4 koneksi 8,4 MB/s vs 1 koneksi 3,9. */
export const PARALLEL = { parts: 4, minSize: 16_000_000 };

/**
 * Update aplikasi dari mode crew (aturan 7, DECISIONS #80/#89/#106): unduh installer NSIS ke folder temp. Installer
 * ≥ `PARALLEL.minSize` dipecah jadi `PARALLEL.parts` bagian yang diunduh bersamaan; tiap bagian lanjut dari byte
 * terakhir kalau putus (HTTP Range, file `.part<i>`), batas macet 60 detik, koneksi lambat disambung ulang.
 * `release()` dipanggil tiap percobaan supaya URL bertanda tangan selalu segar; versi berganti = berhenti.
 * Ukuran + sha256 dicocokkan. Pemanggil menutup aplikasi setelah `runInstaller` supaya installer bisa mengganti file.
 */
export async function downloadInstaller(
  release: () => Promise<BoothUpdateResponse>,
  tempDir: string,
  onProgress: (p: UpdateProgress) => void,
  /** Checksum gagal → buang semua bagian dan ulang sekali lagi dalam panggilan yang sama. */
  retryCorrupt = true,
): Promise<string> {
  let r = await release();
  const version = r.version;
  const file = join(tempDir, `Tetra-Booth-Setup-${version}.exe`);
  const part = `${file}.part`;
  // Sudah terunduh lengkap sebelumnya (unduhan latar belakang): langsung pakai kalau utuh.
  const done = await stat(file).then(
    (s) => s.size,
    () => 0,
  );
  if (done === r.size && (await sha256File(file)) === r.sha256) {
    console.info(`[update] memakai ${version} yang sudah diunduh`);
    return file;
  }

  const n = r.size >= PARALLEL.minSize ? PARALLEL.parts : 1;
  console.info(`[update] mengunduh ${version} (${Math.round(r.size / 1e6)} MB, ${n} bagian)`);
  const bounds = Array.from({ length: n }, (_, i) => [
    Math.floor((i * r.size) / n),
    Math.floor(((i + 1) * r.size) / n),
  ]) as [number, number][];
  const files = bounds.map((_, i) => (n === 1 ? part : `${part}${i}`));
  const got = bounds.map(() => 0);
  const report = () => onProgress({ received: got.reduce((a, b) => a + b, 0), total: r.size });
  /** Versi baru terbit di tengah unduhan: `.part` versi lama tidak boleh disambung dengan file lain. */
  let changed: string | null = null;
  let slowRestarts = 0;
  /** Satu bagian gagal total → hentikan bagian lain (jangan terus menulis `.part<i>` setelah fungsi ini selesai). */
  let halted = false;
  const live = new Set<AbortController>();

  /** Unduh satu bagian [from, to) ke `dest`; true = lengkap. */
  const fetchPart = async (i: number): Promise<void> => {
    const [from, to] = bounds[i] as [number, number];
    const dest = files[i] as string;
    const len = to - from;
    let lastError: unknown;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      if (changed || halted) return;
      let have = await stat(dest).then(
        (s) => s.size,
        () => 0,
      );
      if (have > len) {
        await rm(dest, { force: true });
        have = 0;
      }
      got[i] = have;
      if (have === len) return;
      const abort = new AbortController();
      live.add(abort);
      let stall = setTimeout(() => abort.abort(), STALL_MS);
      try {
        if (attempt > 1 || i > 0) {
          const x = await release();
          if (x.version !== version) {
            changed = x.version;
            return;
          }
          r = x;
        }
        // Satu bagian: Range terbuka seperti dulu (tanpa header di awal). Beberapa bagian: rentang tertutup.
        const range =
          n === 1 ? (have ? `bytes=${have}-` : undefined) : `bytes=${from + have}-${to - 1}`;
        const res = await fetch(r.url, { headers: range ? { range } : {}, signal: abort.signal });
        // 206 = lanjut dari `have`; 200 = server mengirim ulang dari awal (hanya boleh kalau satu bagian).
        const resume = res.status === 206;
        if (!res.ok || !res.body) throw new Error(`server ${res.status}`);
        if (n > 1 && !resume) throw new Error("server tidak mendukung Range");
        let received = resume ? have : 0;
        const start = received;
        const t0 = Date.now();
        let slowChecked = false;
        await pipeline(
          Readable.fromWeb(res.body as WebStream<Uint8Array>),
          new Transform({
            transform(chunk: Buffer, _enc, next) {
              clearTimeout(stall);
              stall = setTimeout(() => abort.abort(), STALL_MS);
              received += chunk.byteLength;
              got[i] = received;
              report();
              const dt = Date.now() - t0;
              if (!slowChecked && dt >= SLOW.ms && slowRestarts < SLOW_RESTARTS) {
                slowChecked = true;
                if (((received - start) * 1000) / dt < SLOW.bps / n) {
                  next(null, chunk);
                  abort.abort(new Error("slow"));
                  return;
                }
              }
              next(null, chunk);
            },
          }),
          createWriteStream(dest, { flags: resume ? "a" : "w" }),
        );
      } catch (e) {
        if (abort.signal.reason instanceof Error && abort.signal.reason.message === "slow") {
          slowRestarts++;
          console.info(`[update] koneksi lambat, sambung ulang (${slowRestarts}/${SLOW_RESTARTS})`);
          attempt--; // bukan kegagalan
          continue;
        }
        lastError = e;
        console.warn(
          `[update] unduhan terputus (bagian ${i + 1}/${n}, percobaan ${attempt}/${ATTEMPTS}): ${e instanceof Error ? e.message : String(e)}`,
        );
      } finally {
        clearTimeout(stall);
        live.delete(abort);
      }
    }
    const have = await stat(dest).then(
      (s) => s.size,
      () => 0,
    );
    if (have !== len && !changed && !halted)
      throw new Error(
        `installer gagal diunduh: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
      );
  };

  const results = await Promise.allSettled(
    bounds.map((_, i) =>
      fetchPart(i).catch((e: unknown) => {
        halted = true;
        for (const a of live) a.abort();
        throw e;
      }),
    ),
  );
  const failed = results.find((x) => x.status === "rejected");
  if (failed) throw failed.reason;
  if (changed) {
    await Promise.all(files.map((f) => rm(f, { force: true })));
    throw new Error(`versi ${changed} terbit saat mengunduh ${version}, unduhan diulang`);
  }
  // Gabungkan bagian → satu file, lalu cek ukuran + sha256.
  if (n > 1) {
    const out = createWriteStream(part);
    for (const f of files) await pipeline(createReadStream(f), out, { end: false });
    await new Promise<void>((ok, fail) => out.end((e?: Error | null) => (e ? fail(e) : ok())));
  }
  const size = await stat(part).then((s) => s.size);
  if (size === r.size && (await sha256File(part)) === r.sha256) {
    await rename(part, file);
    if (n > 1) await Promise.all(files.map((f) => rm(f, { force: true })));
    return file;
  }
  // Rusak: buang semua bagian lalu ulang sekali dari awal (dulu: diulang di dalam loop percobaan).
  await Promise.all([part, ...files].map((f) => rm(f, { force: true })));
  if (retryCorrupt) {
    console.warn("[update] checksum tidak cocok, unduh ulang dari awal");
    return downloadInstaller(release, tempDir, onProgress, false);
  }
  throw new Error("installer gagal diunduh: checksum tidak cocok");
}

export function runInstaller(file: string) {
  spawn(file, ["/S", "--force-run"], { detached: true, stdio: "ignore" }).unref();
}
