import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { EDSDK_FILES, type EdsdkResponse } from "@tetra/shared";

/**
 * Pastikan DLL SDK kamera ada di `dir` sebelum Camera Service jalan (DECISIONS #112; Lumix #214 lewat `files` &
 * `brand`). Belum ada → unduh dari cloud (hanya booth yang dipasangkan), cocokkan ukuran + sha256, tulis lewat file
 * sementara. Offline / belum dipasangkan / belum ada di cloud = false (booth tetap jalan tanpa kamera itu; dicoba
 * lagi saat dibuka berikutnya).
 */
export async function ensureEdsdk(
  dir: string,
  manifest: () => Promise<EdsdkResponse | null>,
  log: (m: string) => void,
  files: readonly string[] = EDSDK_FILES,
  brand = "Canon",
): Promise<boolean> {
  if (files.every((f) => existsSync(join(dir, f)))) return true;
  let m: EdsdkResponse | null;
  try {
    m = await manifest();
  } catch (e) {
    log(`[edsdk] tidak bisa mengambil DLL ${brand}: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
  if (!m || !files.every((f) => m.files.some((x) => x.name === f))) {
    log(`[edsdk] DLL ${brand} belum ada di cloud`);
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
    log(`[edsdk] DLL ${brand} ${m.version} diunduh ke ${dir}`);
    return true;
  } catch (e) {
    log(`[edsdk] unduh DLL ${brand} gagal: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

/**
 * Canon EDSDK (#111) tidak bisa berbagi kamera: aplikasi tether lain yang masih jalan (EOS Utility, atau
 * CameraControl.exe = digiCamControl lama, dipensiunkan #141/#168) membuat buka sesi gagal terus `0x000000C0`
 * (port dipakai, uji 60D 2026-09-29). Tutup dulu sebelum Camera Service mulai.
 */
export async function releaseCameraForEdsdk(log: (m: string) => void) {
  if (process.platform !== "win32") return;
  for (const im of [
    "CameraControl.exe",
    "EOS Utility 3.exe",
    "EOS Utility 2.exe",
    "EOS Utility.exe",
  ]) {
    const closed = await new Promise<boolean>((r) =>
      execFile("taskkill", ["/IM", im, "/F"], { windowsHide: true }, (err) => r(!err)),
    );
    if (closed) log(`[canon] ${im} ditutup (memegang kamera, EDSDK tidak bisa berbagi)`);
  }
}
