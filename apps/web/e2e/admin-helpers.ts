import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";

/** Data uji admin di Supabase dev: user sementara + keanggotaan organisasi Tetra. */
const envFile = join(__dirname, "../.env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
export const hasDb =
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;
export const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://x",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "x",
  { auth: { persistSession: false } },
);

export async function makeUser(role: "owner" | "admin" | "crew" | null) {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}A1!`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser");
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  if (role) await db.from("members").insert({ organization_id: org, user_id: data.user.id, role });
  return {
    email,
    password,
    org,
    id: data.user.id,
    cleanup: async () => {
      await db.from("members").delete().eq("user_id", data.user.id);
      await db.auth.admin.deleteUser(data.user.id);
    },
  };
}

export async function login(page: Page, u: { email: string; password: string }) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Kata sandi").fill(u.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}
