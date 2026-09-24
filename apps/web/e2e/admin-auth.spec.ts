import { expect, test } from "@playwright/test";
import { hasDb, login, makeUser } from "./admin-helpers";

/** A1: masuk admin, guard anggota, keluar. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("belum masuk → halaman masuk; salah sandi → pesan", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Email").fill("tidak-ada@example.com");
  await page.getByLabel("Kata sandi").fill("salah");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page.getByText("Email atau kata sandi salah")).toBeVisible();
});

test("owner masuk → admin, keluar → halaman masuk", async ({ page }) => {
  const u = await makeUser("owner");
  try {
    await login(page, u);
    await expect(page.getByRole("heading", { name: "Event" })).toBeVisible();
    await expect(page.getByText("Owner")).toBeVisible();
    await page.screenshot({ path: "test-results/admin-shell.png" });
    await page.getByRole("button", { name: "Keluar" }).click();
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  } finally {
    await u.cleanup();
  }
});

test("bukan anggota → ditolak", async ({ page }) => {
  const u = await makeUser(null);
  try {
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(u.email);
    await page.getByLabel("Kata sandi").fill(u.password);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page.getByText("Akun ini bukan anggota organisasi")).toBeVisible();
  } finally {
    await u.cleanup();
  }
});
