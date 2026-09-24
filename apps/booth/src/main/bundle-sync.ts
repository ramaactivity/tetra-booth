import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type BundleManifest, EventBundleSchema } from "@tetra/shared";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/**
 * Pasang bundle dari cloud ke `events/{id}/bundle` (TSD §4.1): file yang hash-nya sama disalin dari bundle lama,
 * sisanya diunduh dan dicek hash-nya, config divalidasi, lalu folder sementara menggantikan folder lama.
 * Gagal di tengah → bundle lama tetap utuh.
 */
export async function installBundle(
  eventDir: string,
  m: BundleManifest,
  download: (url: string) => Promise<Uint8Array>,
) {
  const final = join(eventDir, "bundle");
  const tmp = join(eventDir, "bundle.tmp");
  const old = join(eventDir, "bundle.old");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  for (const f of m.files) {
    if (!/^[\w][\w.-]*$/.test(f.file)) throw new Error(`nama file bundle tidak valid: ${f.file}`);
    const prev = join(final, f.file);
    if (existsSync(prev) && sha256(readFileSync(prev)) === f.sha256) {
      copyFileSync(prev, join(tmp, f.file));
      continue;
    }
    const bytes = await download(f.url);
    if (sha256(bytes) !== f.sha256) throw new Error(`hash ${f.file} tidak cocok`);
    writeFileSync(join(tmp, f.file), bytes);
  }
  writeFileSync(
    join(tmp, "config.json"),
    JSON.stringify(EventBundleSchema.parse(m.config), null, 2),
  );
  rmSync(old, { recursive: true, force: true });
  if (existsSync(final)) renameSync(final, old);
  renameSync(tmp, final);
  rmSync(old, { recursive: true, force: true });
}
