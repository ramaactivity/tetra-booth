import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** E7: owner mengundang → link undangan → buat sandi → masuk; ubah role; nonaktifkan. Plus lupa kata sandi. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("undang anggota, buat sandi dari link, ubah role, nonaktifkan", async ({ page, browser }) => {
  const owner = await makeUser("owner");
  const email = `e2e-invite-${Date.now()}@example.com`;
  try {
    await login(page, owner);
    await page.getByRole("link", { name: "Tim" }).click();
    await page.getByRole("button", { name: "Undang Anggota" }).click();
    await page.getByRole("dialog").getByLabel("Email").fill(email);
    await page.getByText("Kelola event").click();
    await page.getByRole("button", { name: "Kirim Undangan" }).click();
    // example.com ditolak pengirim email Supabase → jalur cadangan: link untuk dikirim manual.
    const link = await page.getByLabel("Link undangan").inputValue();
    expect(link).toContain("type=invite");
    await page.screenshot({ path: "test-results/admin-team-invite.png" });

    const guest = await (await browser.newContext()).newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: "Buat kata sandi" })).toBeVisible();
    await guest.getByLabel("Kata sandi baru").fill("rahasia-baru-1");
    await guest.getByLabel("Ulangi kata sandi").fill("rahasia-baru-1");
    await guest.getByRole("button", { name: "Simpan & Masuk" }).click();
    await expect(guest).toHaveURL(/\/admin$/);
    await expect(guest.getByText("Admin", { exact: true })).toBeVisible();
    await expect(guest.getByRole("link", { name: "Tim" })).toHaveCount(0);

    await page.getByRole("button", { name: "Tutup" }).click();
    await page.reload();
    const row = page.getByTestId("member-row").filter({ hasText: email });
    const cell = (n: number) => row.getByRole("cell").nth(n);
    await expect(cell(2)).toHaveText("Admin");
    await row.getByLabel(`Aksi ${email}`).click();
    await row.getByRole("button", { name: "Jadikan Crew" }).click();
    await expect(cell(2)).toHaveText("Crew");
    page.once("dialog", (d) => d.accept());
    await row.getByLabel(`Aksi ${email}`).click();
    await row.getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(cell(3)).toHaveText("Nonaktif");
    await page.screenshot({ path: "test-results/admin-team.png", fullPage: true });

    await guest.reload();
    await expect(guest).toHaveURL(/\/admin\/login\?e=akses/);
  } finally {
    const { data } = await db.auth.admin.listUsers({ perPage: 1000 });
    const u = data.users.find((x) => x.email === email);
    if (u) {
      await db.from("members").delete().eq("user_id", u.id);
      await db.auth.admin.deleteUser(u.id);
    }
    await owner.cleanup();
  }
});

test("lupa kata sandi: jawaban sama untuk email apa pun, link tanpa token ditolak", async ({
  page,
}) => {
  await page.goto("/admin/login");
  await page.getByRole("link", { name: "Lupa kata sandi?" }).click();
  await expect(page.getByRole("heading", { name: "Atur ulang kata sandi" })).toBeVisible();
  await page.getByLabel("Email").fill(`tidak-ada-${Date.now()}@example.com`);
  await page.getByRole("button", { name: "Kirim Link" }).click();
  await expect(page.getByRole("status")).toContainText("Kalau email ini terdaftar");
  await page.goto("/admin/password");
  await expect(page.getByText("Link sudah tidak berlaku")).toBeVisible();
});

test("non-owner tidak bisa membuka Tim", async ({ page }) => {
  const admin = await makeUser("admin");
  try {
    await login(page, admin);
    await page.goto("/admin/team");
    await expect(page).toHaveURL(/\/admin\/login\?e=akses/);
  } finally {
    await admin.cleanup();
  }
});
