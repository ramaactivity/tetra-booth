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
 * Kirim email undangan; kalau gagal (SMTP, batas per jam) → link undangan untuk dikirim manual.
 * Jalan untuk email baru maupun user undangan yang belum pernah masuk (kirim ulang).
 */
async function sendInvite(email: string) {
  const svc = createServiceClient();
  const redirectTo = passwordUrl();
  const sent = await svc.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (sent.data.user) return { userId: sent.data.user.id, r: { sent: email } };
  const gen = await svc.auth.admin.generateLink({ type: "invite", email, options: { redirectTo } });
  if (gen.error || !gen.data.user) return null;
  return { userId: gen.data.user.id, r: { link: gen.data.properties.action_link, email } };
}

/**
 * Undang anggota (E7, DECISIONS #69). Email yang sudah punya akun langsung jadi anggota (masuk dengan
 * sandinya sendiri / Lupa kata sandi); akun yang belum pernah masuk dikirimi undangan lagi.
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
    if (await addMember(existing.id)) return { error: t.failed };
    if (!existing.last_sign_in_at) return (await sendInvite(email))?.r ?? { added: email };
    return { added: email };
  }

  const s = await sendInvite(email);
  if (!s || (await addMember(s.userId))) return { error: t.failed };
  return s.r;
}

/** Kirim ulang undangan ke anggota yang belum pernah masuk. Owner saja. */
export async function resendInvite(memberId: string): Promise<InviteResult> {
  const { db, orgId } = await requireMember(["owner"]);
  const { data: m } = await db
    .from("members")
    .select("user_id")
    .eq("id", z.uuid().parse(memberId))
    .eq("organization_id", orgId)
    .maybeSingle();
  const u = m && (await authUsers()).find((x) => x.id === m.user_id);
  if (!u?.email || u.last_sign_in_at) return { error: t.failed };
  return (await sendInvite(u.email))?.r ?? { error: t.failed };
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

/** Keluarkan anggota dari tim (akun login-nya tetap; bisa diundang lagi). Owner saja, bukan diri sendiri. */
export async function removeMember(memberId: string) {
  const { db, orgId, user } = await requireMember(["owner"]);
  await db
    .from("members")
    .delete()
    .eq("id", z.uuid().parse(memberId))
    .eq("organization_id", orgId)
    .neq("user_id", user.id);
  revalidatePath("/admin/team");
}
