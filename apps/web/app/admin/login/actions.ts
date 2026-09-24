"use server";
import { redirect } from "next/navigation";
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
