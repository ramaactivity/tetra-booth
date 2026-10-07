import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import type { BoothUpdateResponse } from "@tetra/shared";
import { assemble, parseBlockmap, planDiff } from "./differential";

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
/** URL bertanda tangan berlaku 2 jam; diminta ulang tiap percobaan ulang atau kalau lebih tua dari ini. */
const URL_MAX_AGE_MS = 30 * 60_000;
const PREFIX = "Tetra-Booth-Setup-";

type Ctx = {
  release: () => Promise<BoothUpdateResponse>;
  version: string;
  r: BoothUpdateResponse;
  at: number;
};
type Part = { from: number; to: number; dest: string };

const sizeOf = (f: string) =>
  stat(f).then(
    (s) => s.size,
    () => 0,
  );
const verify = async (f: string, r: BoothUpdateResponse) =>
  (await sizeOf(f)) === r.size && (await sha256File(f)) === r.sha256;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Unduh rentang [from, to) installer rilis ke `dest` masing-masing, paling banyak `PARALLEL.parts` sekaligus. Tiap
 * rentang lanjut dari byte terakhir kalau putus, batas macet 60 detik, koneksi lambat disambung ulang (#89/#94/#106).
 * `whole` = satu rentang berisi seluruh file: permintaan pertama tanpa header Range dan server boleh menjawab 200.
 */
async function fetchParts(
  ctx: Ctx,
  parts: Part[],
  whole: boolean,
  onProgress: (p: UpdateProgress) => void,
): Promise<void> {
  const n = Math.min(parts.length, PARALLEL.parts);
  const total = parts.reduce((a, p) => a + p.to - p.from, 0);
  const got = parts.map(() => 0);
  const report = () => onProgress({ received: got.reduce((a, b) => a + b, 0), total });
  /** Versi baru terbit di tengah unduhan: `.part` versi lama tidak boleh disambung dengan file lain. */
  let changed: string | null = null;
  let slowRestarts = 0;
  /** Satu bagian gagal total → hentikan bagian lain (jangan terus menulis `.part<i>` setelah fungsi ini selesai). */
  let halted = false;
  const live = new Set<AbortController>();

  const fetchPart = async (i: number): Promise<void> => {
    const { from, to, dest } = parts[i] as Part;
    const len = to - from;
    let lastError: unknown;
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      if (changed || halted) return;
      let have = await sizeOf(dest);
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
        if (attempt > 1 || Date.now() - ctx.at > URL_MAX_AGE_MS) {
          const x = await ctx.release();
          if (x.version !== ctx.version) {
            changed = x.version;
            return;
          }
          ctx.r = x;
          ctx.at = Date.now();
        }
        // Satu bagian: Range terbuka seperti dulu (tanpa header di awal). Beberapa bagian: rentang tertutup.
        const range = whole
          ? have
            ? `bytes=${have}-`
            : undefined
          : `bytes=${from + have}-${to - 1}`;
        const res = await fetch(ctx.r.url, {
          headers: range ? { range } : {},
          signal: abort.signal,
        });
        // 206 = lanjut dari `have`; 200 = server mengirim ulang dari awal (hanya boleh kalau satu bagian).
        const resume = res.status === 206;
        if (!res.ok || !res.body) throw new Error(`server ${res.status}`);
        if (!whole && !resume) throw new Error("server tidak mendukung Range");
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
          `[update] unduhan terputus (bagian ${i + 1}/${parts.length}, percobaan ${attempt}/${ATTEMPTS}): ${msg(e)}`,
        );
      } finally {
        clearTimeout(stall);
        live.delete(abort);
      }
    }
    if ((await sizeOf(dest)) !== len && !changed && !halted)
      throw new Error(`installer gagal diunduh: ${msg(lastError)}`);
  };

  let next = 0;
  const worker = async () => {
    while (next < parts.length && !changed && !halted) await fetchPart(next++);
  };
  const results = await Promise.allSettled(
    Array.from({ length: n }, () =>
      worker().catch((e: unknown) => {
        halted = true;
        for (const a of live) a.abort();
        throw e;
      }),
    ),
  );
  const failed = results.find((x) => x.status === "rejected");
  if (failed) throw failed.reason;
  if (changed) {
    await Promise.all(parts.map((p) => rm(p.dest, { force: true })));
    throw new Error(`versi ${changed} terbit saat mengunduh ${ctx.version}, unduhan diulang`);
  }
}

/**
 * Update diferensial (DECISIONS #139): installer versi lain + blockmap-nya yang tersimpan di `dir` jadi sumber
 * potongan yang sama; hanya potongan yang berubah diunduh (Range), lalu disusun ke `.part` dan dicek ukuran + sha256.
 * false = tidak ada installer lama yang bisa dipakai. Gagal apa pun = Error (pemanggil jatuh ke unduhan penuh).
 */
async function differential(
  ctx: Ctx,
  dir: string,
  file: string,
  blockmap: Buffer,
  onProgress: (p: UpdateProgress) => void,
): Promise<boolean> {
  const names = await readdir(dir);
  const old = names.find(
    (f) =>
      /^Tetra-Booth-Setup-\d+\.\d+\.\d+\.exe$/.test(f) &&
      f !== basename(file) &&
      names.includes(`${f}.blockmap`),
  );
  if (!old) return false;
  const oldFile = join(dir, old);
  const ops = planDiff(
    parseBlockmap(await readFile(`${oldFile}.blockmap`)),
    parseBlockmap(blockmap),
  );
  if (ops.reduce((a, o) => a + o.size, 0) !== ctx.r.size)
    throw new Error("ukuran di blockmap tidak cocok dengan rilis");
  const part = `${file}.part`;
  const parts = ops
    .filter((o) => o.kind === "download")
    .map((o, i) => ({ from: o.from, to: o.from + o.size, dest: `${part}.d${i}` }));
  const mb = (b: number) => (b / 1e6).toFixed(1);
  const dl = parts.reduce((a, p) => a + p.to - p.from, 0);
  console.info(
    `[update] diferensial dari ${old}: unduh ${mb(dl)} MB dari ${mb(ctx.r.size)} MB (${parts.length} rentang)`,
  );
  await fetchParts(ctx, parts, false, onProgress);
  await assemble(
    ops,
    oldFile,
    parts.map((p) => p.dest),
    part,
  );
  await Promise.all(parts.map((p) => rm(p.dest, { force: true })));
  if (!(await verify(part, ctx.r))) {
    await rm(part, { force: true });
    throw new Error("checksum hasil diferensial tidak cocok");
  }
  await rename(part, file);
  console.info(
    `[update] diferensial ${ctx.version} selesai: ${mb(dl)} / ${mb(ctx.r.size)} MB diunduh`,
  );
  return true;
}

/** Simpan blockmap installer baru (sumber update diferensial berikutnya) & buang file versi lain. */
async function keep(dir: string, file: string, blockmap: Buffer | null) {
  if (blockmap) await writeFile(`${file}.blockmap`, blockmap);
  const mine = [basename(file), `${basename(file)}.blockmap`];
  for (const f of await readdir(dir))
    if (f.startsWith(PREFIX) && !mine.includes(f)) await rm(join(dir, f), { force: true });
}

/**
 * Update aplikasi dari mode crew (aturan 7, DECISIONS #80/#89/#106/#139): unduh installer NSIS ke `dir` (folder
 * update di data booth). Ada installer versi lain + blockmap di `dir` dan rilis punya `blockmapUrl` → coba
 * diferensial dulu; gagal apa pun → unduhan penuh. Installer ≥ `PARALLEL.minSize` dipecah jadi `PARALLEL.parts`
 * bagian yang diunduh bersamaan. `release()` dipanggil tiap percobaan ulang supaya URL bertanda tangan selalu
 * segar; versi berganti = berhenti. Ukuran + sha256 dicocokkan. Installer terakhir + blockmap-nya disimpan (sumber
 * diferensial berikutnya). Pemanggil menutup aplikasi setelah `runInstaller` supaya installer bisa mengganti file.
 */
export async function downloadInstaller(
  release: () => Promise<BoothUpdateResponse>,
  dir: string,
  onProgress: (p: UpdateProgress) => void,
  /** Checksum gagal → buang semua bagian dan ulang sekali lagi (penuh) dalam panggilan yang sama. */
  retryCorrupt = true,
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const r = await release();
  const version = r.version;
  const file = join(dir, `${PREFIX}${version}.exe`);
  const part = `${file}.part`;
  // Sudah terunduh lengkap sebelumnya (unduhan latar belakang): langsung pakai kalau utuh.
  if (await verify(file, r)) {
    console.info(`[update] memakai ${version} yang sudah diunduh`);
    return file;
  }
  const ctx: Ctx = { release, version, r, at: Date.now() };
  const blockmap = r.blockmapUrl
    ? await fetch(r.blockmapUrl, { signal: AbortSignal.timeout(60_000) })
        .then(async (x) => {
          if (!x.ok) throw new Error(`server ${x.status}`);
          return Buffer.from(await x.arrayBuffer());
        })
        .catch((e: unknown) => {
          console.warn(`[update] blockmap gagal diunduh: ${msg(e)}`);
          return null;
        })
    : null;
  if (blockmap && retryCorrupt) {
    const ok = await differential(ctx, dir, file, blockmap, onProgress).catch((e: unknown) => {
      if (msg(e).includes("terbit saat mengunduh")) throw e;
      console.warn(`[update] diferensial gagal, unduh penuh: ${msg(e)}`);
      return false;
    });
    if (ok) {
      await keep(dir, file, blockmap);
      return file;
    }
  }

  const n = r.size >= PARALLEL.minSize ? PARALLEL.parts : 1;
  console.info(`[update] mengunduh ${version} (${Math.round(r.size / 1e6)} MB, ${n} bagian)`);
  const parts = Array.from({ length: n }, (_, i) => ({
    from: Math.floor((i * r.size) / n),
    to: Math.floor(((i + 1) * r.size) / n),
    dest: n === 1 ? part : `${part}${i}`,
  }));
  await fetchParts(ctx, parts, n === 1, onProgress);
  // Gabungkan bagian → satu file, lalu cek ukuran + sha256.
  if (n > 1) {
    const out = createWriteStream(part);
    for (const p of parts) await pipeline(createReadStream(p.dest), out, { end: false });
    await new Promise<void>((ok, fail) => out.end((e?: Error | null) => (e ? fail(e) : ok())));
  }
  if (await verify(part, ctx.r)) {
    await rename(part, file);
    if (n > 1) await Promise.all(parts.map((p) => rm(p.dest, { force: true })));
    await keep(dir, file, blockmap);
    return file;
  }
  // Rusak: buang semua bagian lalu ulang sekali dari awal (dulu: diulang di dalam loop percobaan).
  await Promise.all([part, ...parts.map((p) => p.dest)].map((f) => rm(f, { force: true })));
  if (retryCorrupt) {
    console.warn("[update] checksum tidak cocok, unduh ulang dari awal");
    return downloadInstaller(release, dir, onProgress, false);
  }
  throw new Error("installer gagal diunduh: checksum tidak cocok");
}

export function runInstaller(file: string) {
  spawn(file, ["/S", "--force-run"], { detached: true, stdio: "ignore" }).unref();
}
