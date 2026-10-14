"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { copy } from "@/lib/copy";
import { requireMember } from "@/lib/supabase/server";
import { normalizeCode } from "@/lib/vouchers";

export type VoucherResult = { ok: true } | { ok: false; message: string } | null;

const t = copy.admin.vouchers;
const day = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const Form = z
  .object({
    code: z
      .string()
      .transform(normalizeCode)
      .pipe(z.string().regex(/^[A-Z0-9]{3,20}$/)),
    kind: z.enum(["amount", "percent"]),
    value: z.coerce.number().int().min(1).max(10_000_000),
    max_uses: z.union([z.literal(""), z.coerce.number().int().min(1).max(1_000_000)]),
    from: day,
    to: day,
    event_id: z.union([z.literal(""), z.uuid()]),
  })
  .refine((f) => f.kind === "amount" || f.value <= 100);

/** Tanggal WIB → awal hari (mulai) / awal hari berikutnya (sampai, eksklusif). */
const wib = (d: string, nextDay = false) =>
  new Date(new Date(`${d}T00:00:00+07:00`).getTime() + (nextDay ? 86_400_000 : 0)).toISOString();

/** Buat voucher photobox (owner/admin; RLS menulis atas nama user). */
export async function createVoucher(_prev: VoucherResult, form: FormData): Promise<VoucherResult> {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const p = Form.safeParse(Object.fromEntries(form));
  if (!p.success) return { ok: false, message: t.bad };
  const f = p.data;
  if (f.from && f.to && f.to < f.from) return { ok: false, message: t.badDates };
  const { error } = await db.from("vouchers").insert({
    organization_id: orgId,
    code: f.code,
    kind: f.kind,
    value: f.value,
    max_uses: f.max_uses === "" ? null : f.max_uses,
    starts_at: f.from ? wib(f.from) : null,
    ends_at: f.to ? wib(f.to, true) : null,
    event_id: f.event_id || null,
  });
  if (error) return { ok: false, message: error.code === "23505" ? t.taken : t.failed };
  revalidatePath("/admin/vouchers");
  return { ok: true };
}

/** Nyalakan / matikan voucher. Tidak ada hapus: pembayaran lama tetap menunjuk vouchernya. */
export async function setVoucherActive(form: FormData) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const id = z.uuid().safeParse(form.get("id"));
  if (!id.success) return;
  await db
    .from("vouchers")
    .update({ active: form.get("active") === "1" })
    .eq("id", id.data)
    .eq("organization_id", orgId);
  revalidatePath("/admin/vouchers");
}
