import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EDSDK_FILES, type EdsdkResponse } from "@tetra/shared";

/**
 * Pastikan DLL Canon EDSDK ada di `dir` sebelum Camera Service jalan (DECISIONS #112). Belum ada → unduh dari
 * cloud (hanya booth yang dipasangkan), cocokkan ukuran + sha256, tulis lewat file sementara. Offline / belum
 * dipasangkan / belum ada di cloud = false (booth tetap jalan tanpa Canon; dicoba lagi saat dibuka berikutnya).
 */
export async function ensureEdsdk(
  dir: string,
  manifest: () => Promise<EdsdkResponse | null>,
  log: (m: string) => void,
): Promise<boolean> {
  if (EDSDK_FILES.every((f) => existsSync(join(dir, f)))) return true;
  let m: EdsdkResponse | null;
  try {
    m = await manifest();
  } catch (e) {
    log(`[edsdk] tidak bisa mengambil DLL Canon: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  if (!m) {
    log("[edsdk] DLL Canon belum ada di cloud");
    return false;
  }
  try {
    await mkdir(dir, { recursive: true });
    for (const f of m.files) {
      const res = await fetch(f.url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`${f.name}: server ${res.status}`);
      const b = Buffer.from(await res.arrayBuffer());
      if (b.length !== f.size || createHash("sha256").update(b).digest("hex") !== f.sha256)
        throw new Error(`${f.name}: ukuran/sha256 tidak cocok`);
      const tmp = join(dir, `${f.name}.part`);
      await writeFile(tmp, b);
      await rename(tmp, join(dir, f.name));
    }
    log(`[edsdk] DLL Canon ${m.version} diunduh ke ${dir}`);
    return true;
  } catch (e) {
    log(`[edsdk] unduh DLL Canon gagal: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
