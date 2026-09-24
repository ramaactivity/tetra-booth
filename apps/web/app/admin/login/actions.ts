"use server";
import { redirect } from "next/navigation";
import { passwordUrl } from "@/lib/auth-admin";
import { copy } from "@/lib/copy";
import { createAnonClient } from "@/lib/supabase/anon";
import { createUserClient } from "@/lib/supabase/server";

export async function signIn(_prev: string | null, form: FormData): Promise<string | null> {
  const db = await createUserClient();
  const { error } = await db.auth.signInWithPassword({
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (error) return "Email atau kata sandi salah";
  redirect("/admin");
}

export async function signOut() {
  const db = await createUserClient();
  await db.auth.signOut();
  redirect("/admin/login");
}

/**
 * Lupa kata sandi: Supabase mengirim link ke /admin/password (alur implicit, token di hash, jadi link tetap jalan
 * walau dibuka di HP lain). Jawaban selalu sama supaya email terdaftar tidak bisa ditebak.
 */
export async function requestReset(_prev: string | null, form: FormData): Promise<string | null> {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (email)
    await createAnonClient().auth.resetPasswordForEmail(email, { redirectTo: passwordUrl() });
  return copy.admin.forgotSent;
}
