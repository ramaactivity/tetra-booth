"use server";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Json } from "@tetra/db";
import { canvasFits, LAYOUT_PRESETS, LayoutSpecSchema } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { libFont } from "@/lib/fonts";
import { ASSET_IDS, type AssetId, copyLayout, SavedPreset, StoredLayout } from "@/lib/layouts";
import { putObject } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";

const MAX_TOTAL = 4 * 1024 * 1024; // batas request Vercel 4,5 MB
const NewTemplate = z.object({
  name: z.string().trim().min(1).max(80),
  preset: z.enum(Object.keys(LAYOUT_PRESETS) as [keyof typeof LAYOUT_PRESETS]),
});

/** Template baru dari preset (versi 1), lalu buka editornya. */
export async function createTemplate(_prev: string | null, form: FormData): Promise<string | null> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const p = NewTemplate.safeParse(Object.fromEntries(form));
  if (!p.success) return "Isi nama template";
  const id = await copyLayout(db, orgId, p.data.preset, () => p.data.name);
  if (!id) return "Gagal membuat template, coba lagi";
  redirect(`/admin/templates/${id}`);
}

/** Duplikat: versi terbaru jadi template baru "<nama> (salinan)" versi 1, lalu buka editornya. */
export async function duplicateTemplate(id: string) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const copy = await copyLayout(db, orgId, `tpl:${id}`, (n) => `${n} (salinan)`);
  if (!copy) return;
  revalidatePath("/admin/templates");
  redirect(`/admin/templates/${copy}`);
}

export type SaveTemplateResult = { ok: boolean; message: string; version?: number } | null;

async function store(prefix: string, id: string, bytes: Uint8Array, ext: string) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const key = `${prefix}/${sha256}.${ext}`;
  await putObject(key, bytes, MIME[ext] ?? "application/octet-stream");
  return { file: `${id}.${ext}`, sha256, key };
}

/** Ukuran PNG dari header IHDR (byte 16–23). */
const pngSize = (b: Uint8Array) => {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return b.length > 24 && v.getUint32(0) === 0x89504e47
    ? { w: v.getUint32(16), h: v.getUint32(20) }
    : null;
};
const extOf = (id: AssetId, f: File) => {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (id === "ov") return ext === "png" ? "png" : null;
  if (id === "bg") return ["png", "jpg", "jpeg"].includes(ext) ? ext : null;
  return ["ttf", "otf", "woff2"].includes(ext) ? ext : null;
};
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  ttf: "font/ttf",
  otf: "font/otf",
  woff2: "font/woff2",
};

/**
 * Simpan editor (E4) = versi baru (versi lama tidak pernah diubah, event yang memakainya aman).
 * File baru menggantikan aset dengan assetId sama; aset yang tidak lagi dirujuk layout dibuang dari versi ini.
 */
export async function saveTemplate(
  layoutId: string,
  _prev: SaveTemplateResult,
  form: FormData,
): Promise<SaveTemplateResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data: last } = await db
    .from("layout_versions")
    .select("version, spec, layouts!inner(id, name)")
    .eq("layout_id", layoutId)
    .eq("organization_id", orgId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const prev = StoredLayout.safeParse(last?.spec);
  if (!last || !prev.success) return { ok: false, message: "Template tidak ditemukan" };
  const version = last.version + 1;

  let raw: unknown;
  try {
    raw = JSON.parse(String(form.get("layout")));
  } catch {
    return { ok: false, message: "Data template rusak" };
  }
  const parsed = LayoutSpecSchema.safeParse({
    ...(raw as object),
    id: layoutId,
    version,
    paper: prev.data.layout.paper,
    canvas: prev.data.layout.canvas,
  });
  if (!parsed.success) return { ok: false, message: "Periksa lagi slot dan teks" };
  const layout = parsed.data;

  const files = { ...prev.data.files };
  const uploads = ASSET_IDS.flatMap((id) => {
    const f = form.get(id);
    return f instanceof File && f.size > 0 ? [[id, f] as const] : [];
  });
  if (uploads.reduce((n, [, f]) => n + f.size, 0) > MAX_TOTAL)
    return { ok: false, message: "Total file baru maksimal 4 MB per simpan" };
  for (const [id, f] of uploads) {
    const ext = extOf(id, f);
    if (!ext)
      return {
        ok: false,
        message:
          id === "ov"
            ? "Overlay harus PNG"
            : id === "bg"
              ? "Latar harus PNG/JPG"
              : "Font harus TTF/OTF/WOFF2",
      };
    const bytes = new Uint8Array(await f.arrayBuffer());
    if (id === "ov") {
      const s = pngSize(bytes);
      if (!s || s.w !== layout.canvas.width || s.h !== layout.canvas.height)
        return {
          ok: false,
          message: `Overlay harus PNG ${layout.canvas.width}×${layout.canvas.height} px`,
        };
    }
    files[id] = await store(`${orgId}/layouts/${layoutId}`, id, bytes, ext);
  }

  const refs = new Set(
    [
      layout.overlay?.assetId,
      layout.background?.assetId,
      ...layout.texts.map((t) => t.fontAssetId),
    ].filter((x): x is string => !!x && x !== "geist"),
  );
  // Font pustaka: diambil dari public/fonts dan diunggah (key berbasis hash, jadi tidak dobel).
  for (const id of refs) {
    const lib = libFont(id);
    if (lib && !files[id]) {
      const bytes = new Uint8Array(await readFile(join(process.cwd(), "public/fonts", lib.file)));
      files[id] = await store(`${orgId}/layouts/${layoutId}`, id, bytes, "woff2");
    }
  }
  for (const id of refs)
    if (!files[id]) return { ok: false, message: `File untuk "${id}" belum diunggah` };
  for (const id of Object.keys(files)) if (!refs.has(id)) delete files[id];

  const name =
    String(form.get("name") ?? "")
      .trim()
      .slice(0, 80) || last.layouts.name;
  const spec: StoredLayout = { layout, files };
  const { error } = await db.from("layout_versions").insert({
    organization_id: orgId,
    layout_id: layoutId,
    version,
    spec: spec as unknown as NonNullable<Json>,
  });
  if (error) return { ok: false, message: "Gagal menyimpan, coba lagi" };
  await db.from("layouts").update({ name }).eq("id", layoutId).eq("organization_id", orgId);
  revalidatePath("/admin/templates");
  revalidatePath(`/admin/templates/${layoutId}`);
  return {
    ok: true,
    version,
    message: `Tersimpan · versi ${version}. Event memakai versi ini setelah pengaturannya disimpan ulang.`,
  };
}

/** Hapus template = arsip (versi & event yang sudah memakainya tidak berubah, DECISIONS #74). */
export async function archiveTemplate(id: string) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  await db
    .from("layouts")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/admin/templates");
}

const NewPreset = SavedPreset.omit({ id: true })
  .extend({ name: z.string().trim().min(1).max(60) })
  .refine((p) => canvasFits(p.paper, p), "ukuran kanvas tidak sesuai format");

export type SavePresetResult = { ok: true; preset: SavedPreset } | { ok: false; message: string };

/** "Simpan tata letak ini": posisi slot foto kanvas sekarang jadi tata letak cepat organisasi. */
export async function savePreset(input: {
  name: string;
  paper: string;
  canvas: { width: number; height: number };
  slots: unknown[];
}): Promise<SavePresetResult> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const p = NewPreset.safeParse({ ...input, ...input.canvas });
  if (!p.success) return { ok: false, message: "Periksa lagi nama dan slot" };
  const { data, error } = await db
    .from("layout_presets")
    .insert({
      organization_id: orgId,
      name: p.data.name,
      paper: p.data.paper,
      width: p.data.width,
      height: p.data.height,
      slots: p.data.slots,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, message: "Gagal menyimpan tata letak, coba lagi" };
  return { ok: true, preset: { ...p.data, id: data.id } };
}

export async function deletePreset(id: string): Promise<boolean> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { error } = await db
    .from("layout_presets")
    .delete()
    .eq("id", id)
    .eq("organization_id", orgId);
  return !error;
}
