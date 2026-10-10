import "server-only";
import { createHash, randomUUID } from "node:crypto";
import {
  LayoutPaperSchema,
  LayoutSpecSchema,
  PAPER_CANVAS,
  SlotSchema,
  withDefaultQr,
} from "@tetra/shared";
import { z } from "zod";
import { insertLayout, type TemplateMode } from "@/lib/layouts";
import { putObject } from "@/lib/r2";
import type { requireMember } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof requireMember>>["db"];

export const MAX_UPLOAD = 4 * 1024 * 1024; // batas request Vercel 4,5 MB

/** Aset template di R2: `<prefix>/<sha256>.<ext>` (immutable, berbasis hash). */
export async function storeAsset(prefix: string, id: string, bytes: Uint8Array, ext: string) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${prefix}/${sha256}.${ext}`;
  await putObject(key, bytes, MIME[ext] ?? "application/octet-stream");
  return { file: `${id}.${ext}`, sha256, key };
}

/** Ukuran PNG dari header IHDR (byte 16–23). */
export const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return b.length > 24 && v.getUint32(0) === 0x89504e47
    ? { w: v.getUint32(16), h: v.getUint32(20) }
    : null;
};
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ttf: "font/ttf",
  otf: "font/otf",
  woff2: "font/woff2",
};

const UploadForm = z.object({
  paper: LayoutPaperSchema,
  orient: z.enum(["portrait", "landscape"]),
  slots: z
    .string()
    .transform((v, c) => {
      try {
        return JSON.parse(v) as unknown;
      } catch {
        c.addIssue({ code: "custom", message: "slot rusak" });
        return z.NEVER;
      }
    })
    .pipe(z.array(SlotSchema).min(1).max(40)),
});

/**
 * Template dari desain PNG unggahan (#161): overlay penuh kanvas (`ov`) di atas slot hasil deteksi area transparan
 * di browser. PNG sudah diskalakan browser ke ukuran kanvas; server tetap memeriksa ukuran seperti simpan editor.
 */
export async function layoutFromUpload(
  db: Db,
  orgId: string,
  form: FormData,
  name: string,
  mode: TemplateMode,
): Promise<{ id: string | null } | { error: string }> {
  const u = UploadForm.safeParse(Object.fromEntries(form));
  const f = form.get("ov");
  if (!u.success || !(f instanceof File) || !f.size) return { error: "Unggah desain PNG dulu" };
  if (f.size > MAX_UPLOAD) return { error: "Desain maksimal 4 MB" };
  const c = PAPER_CANVAS[u.data.paper];
  const [width, height] = u.data.orient === "landscape" ? [c.height, c.width] : [c.width, c.height];
  const bytes = new Uint8Array(await f.arrayBuffer());
  const s = pngSize(bytes);
  if (!s || s.w !== width || s.h !== height)
    return { error: `Desain harus PNG ${width}×${height} px` };
  const id = randomUUID();
  // QR first (#247): desain PNG belum punya QR → QR otomatis di pojok kosong, bisa digeser di editor.
  const layout = LayoutSpecSchema.transform(withDefaultQr).safeParse({
    id,
    version: 1,
    paper: u.data.paper,
    canvas: { width, height, dpi: 300 },
    background: { color: "#ffffff" },
    slots: u.data.slots,
    overlay: { assetId: "ov" },
    texts: [],
  });
  if (!layout.success) return { error: "Periksa lagi slot foto" };
  // ponytail: kalau insert gagal, objek R2 tertinggal (berbasis hash, aset template memang tidak pernah dihapus).
  const ov = await storeAsset(`${orgId}/layouts/${id}`, "ov", bytes, "png");
  return {
    id: await insertLayout(db, orgId, {
      id,
      name,
      mode,
      spec: { layout: layout.data, files: { ov } },
    }),
  };
}
