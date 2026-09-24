import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@tetra/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/** Klien Supabase milik user (cookie sesi): RLS berlaku. Dipakai admin (TSD §7). */
export async function createUserClient() {
  const jar = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (list) => {
          try {
            for (const c of list) jar.set(c.name, c.value, c.options);
          } catch {
            // Server Component tidak bisa menulis cookie; proxy.ts yang menyegarkan sesi.
          }
        },
      },
    },
  );
}

export type Role = "owner" | "admin" | "crew";

/** Anggota organisasi yang sedang masuk; belum masuk / bukan anggota → ke halaman masuk. */
export async function requireMember(roles: Role[] = ["owner", "admin", "crew"]) {
  const db = await createUserClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: member } = await db
    .from("members")
    .select("organization_id, role, organizations(name)")
    .eq("user_id", user.id)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (!member || !roles.includes(member.role as Role)) redirect("/admin/login?e=akses");
  return {
    db,
    user,
    orgId: member.organization_id,
    role: member.role as Role,
    orgName: member.organizations.name,
  };
}
