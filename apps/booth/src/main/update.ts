import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebStream } from "node:stream/web";
import type { BoothUpdateResponse } from "@tetra/shared";

/**
 * Update aplikasi dari mode crew (aturan 7, DECISIONS #80): unduh installer NSIS ke folder temp, cocokkan
 * sha256 dengan rilis, lalu jalankan diam-diam (`/S --force-run` = pasang tanpa dialog lalu buka lagi).
 * Pemanggil menutup aplikasi setelah fungsi ini selesai supaya installer bisa mengganti file.
 */
export async function downloadInstaller(r: BoothUpdateResponse, tempDir: string) {
  const file = join(tempDir, `Tetra-Booth-Setup-${r.version}.exe`);
  const res = await fetch(r.url, { signal: AbortSignal.timeout(20 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`unduh installer: server ${res.status}`);
  const hash = createHash("sha256");
  let size = 0;
  await pipeline(
    Readable.fromWeb(res.body as WebStream<Uint8Array>),
    new Transform({
      transform(chunk: Buffer, _enc, done) {
        hash.update(chunk);
        size += chunk.byteLength;
        done(null, chunk);
      },
    }),
    createWriteStream(file),
  );
  if (size !== r.size || hash.digest("hex") !== r.sha256) {
    await rm(file, { force: true });
    throw new Error("installer rusak (checksum tidak cocok), coba lagi");
  }
  return file;
}

export function runInstaller(file: string) {
  spawn(file, ["/S", "--force-run"], { detached: true, stdio: "ignore" }).unref();
}
