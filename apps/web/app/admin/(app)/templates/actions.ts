"use server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Json } from "@tetra/db";
import { libFont } from "@tetra/editor";
import {
  ASSET_IDS,
  type AssetId,
  canvasFits,
  LAYOUT_PRESETS,
  LayoutSpecSchema,
  SavedPreset,
} from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { copyLayout, StoredLayout } from "@/lib/layouts";
import { requireMember } from "@/lib/supabase/server";
import { layoutFromUpload, MAX_UPLOAD, pngSize, storeAsset } from "@/lib/template-upload";
import { assignToEvent } from "./assign";

const NewTemplate = z.object({
  name: z.string().trim().min(1).max(80),
  mode: z.enum(["event", "photobox"]),
  /** Preset, "Tata letak saya" (`lp:<id>`), salinan template lain (`tpl:<id>`), atau desain PNG unggahan (#161). */
  source: z.union([
    z.literal("upload"),
    z.enum(Object.keys(LAYOUT_PRESETS) as [keyof typeof LAYOUT_PRESETS]),
    z.string().regex(/^(lp|tpl):[0-9a-f-]{36}$/),
  ]),
  event: z.union([z.literal(""), z.uuid()]).default(""),
  price: z.coerce.number().int().min(1500).max(10_000_000).optional(),
});

/** Wizard Buat Template (#160): mode → kertas → mulai dari → nama → (opsional) pasang ke event → editor. */
export async function createTemplate(_prev: string | null, form: FormData): Promise<string | null> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const p = NewTemplate.safeParse(Object.fromEntries(form));
  if (!p.success) return "Isi nama template";
  const { name, mode, source, event, price } = p.data;
  let id: string | null;
  if (source === "upload") {
    const r = await layoutFromUpload(db, orgId, form, name, mode);
    if ("error" in r) return r.error;
    id = r.id;
  } else id = await copyLayout(db, orgId, source, () => name, mode);
  if (!id) return "Gagal membuat template, coba lagi";
  if (event) {
    const { data: l } = await db.from("layouts").select("id, paper").eq("id", id).single();
    const r = l && (await assignToEvent(db, orgId, l, event, price));
    if (!r?.ok) {
      revalidatePath("/admin/templates");
      return `Template dibuat, tapi belum terpasang ke event: ${r?.message ?? "coba lagi"}. Pasang lewat menu template.`;
    }
  }
  redirect(`/admin/templates/${id}`);
}

export type AssignResult = { ok: boolean; message: string; slug?: string } | null;

/** "Pasang ke event…" dari menu template (#160). */
export async function assignTemplate(
  layoutId: string,
  _prev: AssignResult,
  form: FormData,
): Promise<AssignResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const ev = z.uuid().safeParse(form.get("event"));
  if (!ev.success) return { ok: false, message: "Pilih event dulu" };
  const price = form.get("price");
  const pr =
    price === null ? undefined : z.coerce.number().int().min(1500).max(10_000_000).safeParse(price);
  if (pr && !pr.success) return { ok: false, message: "Harga minimal Rp 1.500" };
  const { data: l } = await db
    .from("layouts")
    .select("id, paper")
    .eq("id", layoutId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!l) return { ok: false, message: "Template tidak ditemukan" };
  const r = await assignToEvent(db, orgId, l, ev.data, pr?.data);
  revalidatePath("/admin/templates");
  return r;
}

/** Pindah template ke tab Event / Photobox (#160). */
export async function setTemplateMode(id: string, mode: "event" | "photobox") {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  await db
    .from("layouts")
    .update({ mode: mode === "photobox" ? "photobox" : "event" })
    .eq("id", id)
    .eq("organization_id", orgId);
  revalidatePath("/admin/templates");
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

const extOf = (id: AssetId, f: File) => {
  const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
  if (id === "ov") return ext === "png" ? "png" : null;
  if (id === "bg") return ["png", "jpg", "jpeg"].includes(ext) ? ext : null;
  return ["ttf", "otf", "woff2"].includes(ext) ? ext : null;
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
  if (uploads.reduce((n, [, f]) => n + f.size, 0) > MAX_UPLOAD)
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
    files[id] = await storeAsset(`${orgId}/layouts/${layoutId}`, id, bytes, ext);
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
      files[id] = await storeAsset(`${orgId}/layouts/${layoutId}`, id, bytes, "woff2");
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
