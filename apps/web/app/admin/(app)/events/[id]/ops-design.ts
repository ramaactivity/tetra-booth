"use server";
import type { Json } from "@tetra/db";
import { revalidatePath } from "next/cache";
import type { OpsSync } from "@/lib/ops-sync";
import { requireMember } from "@/lib/supabase/server";
import { layoutFromUpload } from "@/lib/template-upload";
import { assignToEvent } from "../../templates/assign";

export type InstallResult = { ok: boolean; message: string } | null;

/**
 * "Pasang desain dari Tetra Ops" (#177): PNG ACC (sudah diskalakan & dideteksi slotnya di browser lewat
 * UploadDesign, #161/#163) jadi template baru, lalu dipasang sebagai desain utama event lewat jalur simpan yang
 * sama dengan halaman Template (`assignToEvent`). Waktu pasang dicatat di `ops_sync.design_installed_at`.
 */
export async function installOpsDesign(
  eventId: string,
  _prev: InstallResult,
  form: FormData,
): Promise<InstallResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data: ev } = await db
    .from("events")
    .select("name, slug, ops_sync")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) return { ok: false, message: "Event tidak ditemukan" };
  const made = await layoutFromUpload(db, orgId, form, `${ev.name} · Desain Tetra Ops`, "event");
  if ("error" in made) return { ok: false, message: made.error };
  if (!made.id) return { ok: false, message: "Gagal membuat template, coba lagi" };
  const { data: l } = await db.from("layouts").select("id, paper").eq("id", made.id).single();
  const r = l && (await assignToEvent(db, orgId, l, eventId));
  if (!r?.ok)
    return {
      ok: false,
      message: `Template dibuat, tapi belum terpasang: ${r?.message ?? "coba lagi"}. Pasang lewat menu Template.`,
    };
  const sync = {
    ...((ev.ops_sync ?? {}) as OpsSync),
    design_installed_at: new Date().toISOString(),
  };
  await db
    .from("events")
    .update({ ops_sync: sync as unknown as NonNullable<Json> })
    .eq("id", eventId)
    .eq("organization_id", orgId);
  revalidatePath(`/admin/events/${r.slug ?? ev.slug}`);
  return { ok: true, message: "Desain dari Tetra Ops terpasang sebagai desain utama." };
}
