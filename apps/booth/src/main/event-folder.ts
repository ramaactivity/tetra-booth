import { copyFile, link, mkdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import type { EventFile } from "./db";

/** Subfolder per jenis file (bahasa crew). */
const SUB: Record<string, string> = {
  strip: "Cetak",
  original: "Foto asli",
  animation: "GIF",
  video: "Video",
};

/** Nama folder aman untuk Windows: tanpa \ / : * ? " < > |, tanpa titik/spasi di ujung. */
export const folderName = (name: string) =>
  name
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim()
    .slice(0, 80) || "Event";

/** "2026-10-04 08.12.05" (jam laptop) supaya file urut waktu sesi di Explorer. */
const stamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
};

/**
 * Folder event untuk disalin crew ke flashdisk (#155): file hasil sesi asli dikumpulkan per jenis
 * (Cetak / Foto asli / GIF / Video) dengan nama `<tanggal jam> <sesi>[-n].<ext>`. Pakai hard link (instan, tanpa
 * tambah ruang disk); beda drive / gagal = salin. File yang sudah ada dilewati, jadi aman dibuka berkali-kali.
 * Balas jumlah file baru.
 */
export async function buildEventFolder(dest: string, files: EventFile[]): Promise<number> {
  let added = 0;
  await mkdir(dest, { recursive: true });
  for (const f of files) {
    const sub = SUB[f.kind];
    if (!sub) continue;
    const n = f.kind === "original" ? `-${f.idx + 1}` : "";
    const to = join(dest, sub, `${stamp(f.startedAt)} ${f.sessionId}${n}${extname(f.path)}`);
    if (
      await stat(to).then(
        () => true,
        () => false,
      )
    )
      continue;
    if (
      !(await stat(f.path).then(
        () => true,
        () => false,
      ))
    )
      continue;
    await mkdir(join(dest, sub), { recursive: true });
    await link(f.path, to).catch(() => copyFile(f.path, to));
    added++;
  }
  return added;
}
