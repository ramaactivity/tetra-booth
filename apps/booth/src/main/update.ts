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

export type UpdateProgress = { received: number; total: number };

const sha256File = async (file: string) => {
  const h = createHash("sha256");
  await pipeline(createReadStream(file), h);
  return h.digest("hex");
};

/**
 * Update aplikasi dari mode crew (aturan 7, DECISIONS #80/#89): unduh installer NSIS ke folder temp, lanjut dari
 * byte terakhir kalau putus (HTTP Range, file `.part`), tanpa batas waktu total, hanya batas macet 60 detik.
 * `release()` dipanggil tiap percobaan supaya URL bertanda tangan selalu segar. Ukuran + sha256 dicocokkan.
 * Pemanggil menutup aplikasi setelah `runInstaller` supaya installer bisa mengganti file.
 */
export async function downloadInstaller(
  release: () => Promise<BoothUpdateResponse>,
  tempDir: string,
  onProgress: (p: UpdateProgress) => void,
) {
  let r = await release();
  const file = join(tempDir, `Tetra-Booth-Setup-${r.version}.exe`);
  const part = `${file}.part`;
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const have = await stat(part).then(
      (s) => s.size,
      () => 0,
    );
    if (have > r.size) await rm(part, { force: true });
    else if (have < r.size) {
      const abort = new AbortController();
      let stall = setTimeout(() => abort.abort(), STALL_MS);
      try {
        if (attempt > 1) r = await release();
        const res = await fetch(r.url, {
          headers: have ? { range: `bytes=${have}-` } : {},
          signal: abort.signal,
        });
        // 206 = lanjut dari `have`; 200 = server mengirim ulang dari awal.
        const resume = res.status === 206;
        if (!res.ok || !res.body) throw new Error(`server ${res.status}`);
        let received = resume ? have : 0;
        await pipeline(
          Readable.fromWeb(res.body as WebStream<Uint8Array>),
          new Transform({
            transform(chunk: Buffer, _enc, done) {
              clearTimeout(stall);
              stall = setTimeout(() => abort.abort(), STALL_MS);
              received += chunk.byteLength;
              onProgress({ received, total: r.size });
              done(null, chunk);
            },
          }),
          createWriteStream(part, { flags: resume ? "a" : "w" }),
        );
      } catch (e) {
        lastError = e;
        console.warn(
          `[update] unduhan terputus (percobaan ${attempt}/${ATTEMPTS}): ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      } finally {
        clearTimeout(stall);
      }
    }
    const size = await stat(part).then((s) => s.size);
    if (size === r.size && (await sha256File(part)) === r.sha256) {
      await rename(part, file);
      return file;
    }
    // Rusak: buang dan ulang dari awal.
    await rm(part, { force: true });
    lastError = new Error("checksum tidak cocok");
  }
  throw new Error(
    `installer gagal diunduh: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

export function runInstaller(file: string) {
  spawn(file, ["/S", "--force-run"], { detached: true, stdio: "ignore" }).unref();
}
