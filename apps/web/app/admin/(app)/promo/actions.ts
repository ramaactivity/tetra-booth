"use server";
import { revalidatePath } from "next/cache";
import { PROOFS, PromoConfigSchema } from "@/lib/promo";
import { requireMember } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type SaveResult = { ok: true } | { ok: false; message: string } | null;

/** Simpan pengaturan kartu promosi halaman tamu (#215) ke organizations.promo. Owner/admin. */
export async function savePromo(_prev: SaveResult, form: FormData): Promise<SaveResult> {
  const { orgId } = await requireMember(["owner", "admin"]);
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const proofs = PROOFS.filter((p) => form.get(`proof_${p}`) === "on");
  const parsed = PromoConfigSchema.safeParse({
    whatsapp: s("whatsapp"),
    instagram: s("instagram"),
    tiktok: s("tiktok"),
    reviewUrl: s("reviewUrl"),
    website: s("website"),
    ...(form.get("offer") === "on" && { offer: { reward: s("reward"), proofs } }),
  });
  if (!parsed.success) {
    const k = String(parsed.error.issues[0]?.path[0] ?? "");
    return { ok: false, message: MESSAGES[k] ?? "Periksa lagi isiannya" };
  }
  const { error } = await createServiceClient()
    .from("organizations")
    .update({ promo: parsed.data })
    .eq("id", orgId);
  if (error) return { ok: false, message: "Gagal menyimpan, coba lagi" };
  revalidatePath("/admin/promo");
  return { ok: true };
}

const MESSAGES: Record<string, string> = {
  whatsapp: "Nomor WhatsApp admin tidak valid",
  instagram: "Username Instagram tidak valid",
  tiktok: "Username TikTok tidak valid",
  reviewUrl: "Link ulasan Google harus diawali https://",
  website: "Link website harus diawali https://",
  offer: "Isi hadiah promo dan centang minimal satu jenis bukti",
};
