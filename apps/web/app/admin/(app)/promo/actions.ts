"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROOFS, PromoConfigSchema } from "@/lib/promo";
import { requireMember } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type SaveResult = { ok: true } | { ok: false; message: string } | null;

/** Simpan pengaturan kartu promosi halaman tamu (#215) ke organizations.promo. Owner/admin. */
export async function savePromo(_prev: SaveResult, form: FormData): Promise<SaveResult> {
  const { orgId } = await requireMember(["owner", "admin"]);
  const s = (k: string) => String(form.get(k) ?? "").trim();
  // "Rp 2.000.000" / "2000000" → 2000000; kosong → undefined.
  const num = (k: string) => {
    const v = s(k).replace(/\D/g, "");
    return v ? Number(v) : undefined;
  };
  const proofs = PROOFS.filter((p) => form.get(`proof_${p}`) === "on");
  const parsed = PromoConfigSchema.safeParse({
    whatsapp: s("whatsapp"),
    instagram: s("instagram"),
    tiktok: s("tiktok"),
    reviewUrl: s("reviewUrl"),
    website: s("website"),
    ...(form.get("offer") === "on" && {
      offer: {
        discount:
          s("dtype") === "item"
            ? { type: "item", item: s("item") }
            : {
                type: s("dtype"),
                value: num("dvalue"),
                ...(s("dtype") === "percent" && num("maxIdr") && { maxIdr: num("maxIdr") }),
              },
        ...(num("minIdr") && { minIdr: num("minIdr") }),
        validDays: num("validDays") ?? 30,
        proofs,
      },
    }),
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
  offer: "Isi nilai diskon/bonus dengan benar dan centang minimal satu jenis bukti",
};

/** Tolak / pulihkan kode promo (#218): bukti palsu → kode tidak berlaku di booking Ops. Owner/admin. */
export async function setRejected(form: FormData) {
  const { orgId } = await requireMember(["owner", "admin"]);
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  await createServiceClient()
    .from("leads")
    .update({ promo_rejected_at: form.get("reject") === "1" ? new Date().toISOString() : null })
    .eq("id", id.data)
    .eq("organization_id", orgId)
    .eq("kind", "sales");
  revalidatePath("/admin/promo");
}
