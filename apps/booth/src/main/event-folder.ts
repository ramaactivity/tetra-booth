import { execFile } from "node:child_process";
import { copyFile, link, mkdir, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
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

/** Rencana isi folder event: file sumber → `<Cetak|Foto asli|GIF|Video>/<tanggal jam> <sesi>[-n].<ext>`. */
function plan(files: EventFile[]) {
  const out = new Map<string, string>();
  for (const f of files) {
    const sub = SUB[f.kind];
    if (!sub) continue;
    const n = f.kind === "original" ? `-${f.idx + 1}` : "";
    const to = join(sub, `${stamp(f.startedAt)} ${f.sessionId}${n}${extname(f.path)}`);
    if (!out.has(to)) out.set(to, f.path);
  }
  return out;
}

/**
 * Folder event untuk disalin crew ke flashdisk (#155): file hasil sesi asli dikumpulkan per jenis
 * (Cetak / Foto asli / GIF / Video) dengan nama `<tanggal jam> <sesi>[-n].<ext>`. Pakai hard link (instan, tanpa
 * tambah ruang disk); beda drive / gagal = salin. File yang sudah ada dilewati, jadi aman dibuka berkali-kali.
 * Balas jumlah file baru.
 */
export async function buildEventFolder(dest: string, files: EventFile[]): Promise<number> {
  let added = 0;
  await mkdir(dest, { recursive: true });
  for (const [rel, from] of plan(files)) {
    const to = join(dest, rel);
    if (
      await stat(to).then(
        () => true,
        () => false,
      )
    )
      continue;
    if (
      !(await stat(from).then(
        () => true,
        () => false,
      ))
    )
      continue;
    await mkdir(dirname(to), { recursive: true });
    await link(from, to).catch(() => copyFile(from, to));
    added++;
  }
  return added;
}

/**
 * Ukuran isi folder event (#166) tanpa membangunnya: pilihan file sama dengan buildEventFolder, ukuran dari
 * file sumber yang masih ada di laptop.
 */
export async function eventFolderSize(files: EventFile[]) {
  let bytes = 0;
  let count = 0;
  for (const from of plan(files).values()) {
    const s = await stat(from).catch(() => null);
    if (!s?.isFile()) continue;
    bytes += s.size;
    count++;
  }
  return { bytes, files: count };
}

/** Flashdisk terpasang (Windows): huruf drive + ruang kosong/total dalam byte. */
export type RemovableDrive = { name: string; free: number; total: number };
/** Baris "E:|1234|5678" dari PowerShell → drive; baris rusak dilewati. */
export const parseDrives = (out: string): RemovableDrive[] =>
  out.split(/\r?\n/).flatMap((l) => {
    const m = /^([A-Z]:)\|(\d+)\|(\d+)$/.exec(l.trim());
    return m ? [{ name: m[1] as string, free: Number(m[2]), total: Number(m[3]) }] : [];
  });
/**
 * Drive removable (DriveType 2 = flashdisk/kartu SD) lewat CIM. Hanya Windows; gagal/lambat (> 5 dtk) = kosong.
 * ponytail: HDD/SSD eksternal USB terbaca DriveType 3 (fixed) sehingga tidak muncul; tambah lewat
 * Win32_DiskDrive.InterfaceType=USB kalau crew memakai SSD eksternal.
 */
export function removableDrives(): Promise<RemovableDrive[]> {
  if (process.platform !== "win32") return Promise.resolve([]);
  const ps =
    "Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=2' | Where-Object { $_.Size } | ForEach-Object { \"$($_.DeviceID)|$($_.FreeSpace)|$($_.Size)\" }";
  return new Promise((done) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", ps],
      { timeout: 5000, windowsHide: true },
      (err, out) => done(err ? [] : parseDrives(String(out))),
    );
  });
}
