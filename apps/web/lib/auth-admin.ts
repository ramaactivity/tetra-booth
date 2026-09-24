import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

/** Link di email undangan / atur ulang sandi mendarat di sini (token di hash URL, DECISIONS #69). */
export const passwordUrl = () =>
  `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/admin/password`;

// ponytail: satu halaman listUsers (1000 user) cukup untuk satu organisasi; paginasi kalau SaaS (Fase 8).
export async function authUsers() {
  const { data } = await createServiceClient().auth.admin.listUsers({ perPage: 1000 });
  return data.users;
}
