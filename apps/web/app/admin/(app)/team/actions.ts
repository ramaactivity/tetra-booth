"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authUsers, passwordUrl } from "@/lib/auth-admin";
import { copy } from "@/lib/copy";
import { type Role, requireMember } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

const t = copy.admin.team;
const roleSchema = z.enum(["owner", "admin", "crew"]);
const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(["admin", "crew"]),
});

export type InviteResult =
  | { sent: string }
  | { link: string; email: string }
  | { added: string }
  | { error: string }
  | null;

/**
 * Undang anggota (E7, DECISIONS #69). Email dikirim Supabase; kalau gagal (SMTP bawaan hanya ke alamat tim
 * Supabase, batas per jam) → link undangan ditampilkan untuk dikirim owner lewat WhatsApp.
 * Email yang sudah punya akun langsung jadi anggota (masuk dengan sandinya sendiri / Lupa kata sandi).
 */
export async function invite(_prev: InviteResult, form: FormData): Promise<InviteResult> {
  const { orgId } = await requireMember(["owner"]);
  const parsed = inviteSchema.safeParse({ email: form.get("email"), role: form.get("role") });
  if (!parsed.success) return { error: t.badEmail };
  const { email, role } = parsed.data;
  const svc = createServiceClient();
  const addMember = async (userId: string) => {
    const { error } = await svc
      .from("members")
      .upsert(
        { organization_id: orgId, user_id: userId, role, active: true },
        { onConflict: "organization_id,user_id" },
      );
    revalidatePath("/admin/team");
    return error;
  };

  const existing = (await authUsers()).find((u) => u.email === email);
  if (existing) {
    const { data: member } = await svc
      .from("members")
      .select("id")
      .eq("organization_id", orgId)
      .eq("user_id", existing.id)
      .maybeSingle();
    if (member) return { error: t.already };
    return (await addMember(existing.id)) ? { error: t.failed } : { added: email };
  }

  const redirectTo = passwordUrl();
  const sent = await svc.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (sent.data.user)
    return (await addMember(sent.data.user.id)) ? { error: t.failed } : { sent: email };
  const gen = await svc.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (gen.error || !gen.data.user) return { error: t.failed };
  if (await addMember(gen.data.user.id)) return { error: t.failed };
  return { link: gen.data.properties.action_link, email };
}

/** Ubah role / aktif-nonaktif anggota lain. Owner saja (RLS members: tulis owner); diri sendiri tidak bisa. */
export async function updateMember(memberId: string, patch: { role?: Role; active?: boolean }) {
  const { db, orgId, user } = await requireMember(["owner"]);
  const { role, active } = z
    .object({ role: roleSchema.optional(), active: z.boolean().optional() })
    .parse(patch);
  await db
    .from("members")
    .update({ ...(role && { role }), ...(active !== undefined && { active }) })
    .eq("id", memberId)
    .eq("organization_id", orgId)
    .neq("user_id", user.id);
  revalidatePath("/admin/team");
}
