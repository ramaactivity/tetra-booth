import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { z } from "zod";

/**
 * Update diferensial (DECISIONS #139): blockmap electron-builder = potongan installer berbasis isi (Rabin, ±16 KB),
 * tiap potongan punya checksum + ukuran. Potongan installer baru yang sama persis dengan potongan installer lama
 * disalin dari file lama; sisanya diunduh dengan HTTP Range. Hasil tetap dicek ukuran + sha256 oleh pemanggil.
 */
const Blockmap = z.object({
  files: z
    .array(
      z.object({
        offset: z.number().int().min(0),
        checksums: z.array(z.string()),
        sizes: z.array(z.number().int().positive()),
      }),
    )
    .min(1),
});

type Block = { offset: number; size: number; checksum: string };

/** Blockmap (gzip JSON) → daftar potongan dengan offset kumulatif. */
export function parseBlockmap(gz: Buffer): Block[] {
  const f = Blockmap.parse(JSON.parse(gunzipSync(gz).toString("utf8"))).files[0];
  if (!f || f.checksums.length !== f.sizes.length) throw new Error("blockmap rusak");
  let offset = f.offset;
  return f.sizes.map((size, i) => {
    const b = { offset, size, checksum: f.checksums[i] as string };
    offset += size;
    return b;
  });
}

/** `copy`: ambil dari file lama mulai `from`; `download`: unduh file baru [from, from + size). */
export type Op = { kind: "copy" | "download"; from: number; size: number };

/** Urutan penyusunan file baru; operasi berurutan yang bersambung digabung (satu Range per rentang unduhan). */
export function planDiff(old: Block[], next: Block[]): Op[] {
  const have = new Map<string, number>();
  for (const b of old) {
    const k = `${b.checksum}:${b.size}`;
    if (!have.has(k)) have.set(k, b.offset);
  }
  const ops: Op[] = [];
  for (const b of next) {
    const at = have.get(`${b.checksum}:${b.size}`);
    const op: Op =
      at === undefined
        ? { kind: "download", from: b.offset, size: b.size }
        : { kind: "copy", from: at, size: b.size };
    const last = ops.at(-1);
    if (last && last.kind === op.kind && last.from + last.size === op.from) last.size += op.size;
    else ops.push(op);
  }
  return ops;
}

/**
 * Susun file baru ke `out`: `copy` dari `oldFile`, `download` dari file rentang ke-i (`parts[i]`, urutan sama dengan
 * operasi download di `ops`).
 */
export async function assemble(ops: Op[], oldFile: string, parts: string[], out: string) {
  // Satu file handle, bukan pipeline berulang ke satu WriteStream (listener menumpuk untuk ratusan operasi).
  const fh = await open(out, "w");
  try {
    let i = 0;
    for (const op of ops) {
      const src =
        op.kind === "copy"
          ? createReadStream(oldFile, { start: op.from, end: op.from + op.size - 1 })
          : createReadStream(parts[i++] as string);
      for await (const chunk of src) await fh.write(chunk as Buffer);
    }
  } finally {
    await fh.close();
  }
}
