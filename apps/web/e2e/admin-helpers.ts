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

/**
 * Wizard Buat event (Mode Event): info → mode → kertas + desain (nama di pemilih) → booth → Buat event.
 * Tanpa `devices` = Semua booth. Hasil: id event baru (dari tombol Buka event).
 */
export async function createEventViaWizard(
  page: Page,
  o: {
    name: string;
    date?: string;
    paper: RegExp;
    designs: string[];
    devices?: string[];
    /** Paket manual (nama + jam) di langkah Info. */
    pkg?: { name: string; hours: string };
  },
) {
  await page.goto("/admin");
  await page.getByRole("link", { name: "+ Buat Event" }).click();
  await page.getByLabel("Nama event").fill(o.name);
  await page.getByLabel("Tanggal event").fill(o.date ?? "2026-10-12");
  if (o.pkg) {
    await page.getByLabel("Nama paket").fill(o.pkg.name);
    await page.getByLabel("Durasi (jam)").fill(o.pkg.hours);
  }
  await page.getByRole("button", { name: /^Lanjut/ }).click();
  await page.getByRole("radio", { name: /^Event/ }).check();
  await page.getByRole("button", { name: /^Lanjut/ }).click();
  await page.getByRole("radio", { name: o.paper }).check();
  const picker = page.getByRole("dialog", { name: "Tambah desain frame" });
  for (const d of o.designs) {
    await page.getByRole("button", { name: /Tambah desain/ }).click();
    await picker.getByRole("textbox", { name: "Cari nama desain" }).fill(d);
    await picker
      .getByRole("button", { name: new RegExp(`^${d}`) })
      .first()
      .click();
    await picker.getByRole("button", { name: "Pakai desain ini" }).click();
  }
  await page.getByRole("button", { name: /^Lanjut/ }).click();
  if (o.devices) {
    await page.getByRole("radio", { name: /^Pilih booth/ }).check();
    for (const d of o.devices) await page.getByRole("checkbox", { name: d }).check();
  }
  await page.getByRole("button", { name: /^Lanjut/ }).click();
  await page.getByRole("button", { name: "Buat event" }).click();
  const open = page.getByRole("link", { name: "Buka event" });
  await expect(open).toBeVisible({ timeout: 30_000 });
  return (await open.getAttribute("href"))?.split("/").pop() ?? "";
}
