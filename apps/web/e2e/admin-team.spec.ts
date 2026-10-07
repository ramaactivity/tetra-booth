import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * E7 (#165): owner mengundang → Menunggu → kirim ulang (link) → buat sandi → masuk; ubah role (konfirmasi),
 * nonaktifkan, hapus. Plus lupa kata sandi dan pembatasan non-owner.
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("undang, kirim ulang, buat sandi, ubah role, nonaktifkan, hapus", async ({
  page,
  browser,
}) => {
  const owner = await makeUser("owner");
  const email = `e2e-invite-${Date.now()}@example.com`;
  try {
    await login(page, owner);
    await page.getByRole("link", { name: "Tim" }).click();
    // Baris sendiri: tanpa dropdown role & menu (owner tidak bisa mengubah dirinya).
    const me = page.getByTestId("member-row").filter({ hasText: owner.email });
    await expect(me).toContainText("(kamu)");
    await expect(me.getByRole("combobox")).toHaveCount(0);
    await expect(me.getByRole("button")).toHaveCount(0);

    await page.getByRole("button", { name: "Undang Anggota" }).first().click();
    const dlg = page.getByRole("dialog", { name: "Undang Anggota" });
    await dlg.getByLabel("Email").fill(email);
    await dlg.getByRole("radio", { name: /^Admin/ }).check();
    await dlg.getByRole("button", { name: "Kirim Undangan" }).click();
    // example.com ditolak pengirim email Supabase → jalur cadangan: link untuk dikirim manual.
    expect(await dlg.getByLabel("Link undangan").inputValue()).toContain("type=invite");
    await page.screenshot({ path: "test-results/admin-team-invite.png" });
    await dlg.getByRole("button", { name: "Tutup" }).click();

    await page.reload();
    const row = page.getByTestId("member-row").filter({ hasText: email });
    const role = row.getByRole("combobox", { name: `Role ${email}` });
    const status = row.getByTestId("member-status");
    const menu = (item: string) =>
      row
        .getByRole("button", { name: `Aksi ${email}` })
        .click()
        .then(() => page.getByRole("button", { name: item }).click());
    await expect(role).toHaveText("Admin");
    await expect(status).toContainText("Menunggu");

    await menu("Kirim ulang undangan");
    const resent = page.getByRole("dialog", { name: "Kirim ulang undangan" });
    const link = await resent.getByLabel("Link undangan").inputValue();
    expect(link).toContain("type=invite");
    await resent.getByRole("button", { name: "Tutup" }).click();

    const guest = await (await browser.newContext()).newPage();
    await guest.goto(link);
    await expect(guest.getByRole("heading", { name: "Buat kata sandi" })).toBeVisible();
    await guest.getByLabel("Kata sandi baru").fill("rahasia-baru-1");
    await guest.getByLabel("Ulangi kata sandi").fill("rahasia-baru-1");
    await guest.getByRole("button", { name: "Simpan & Masuk" }).click();
    await expect(guest).toHaveURL(/\/admin$/);
    await expect(guest.getByText("Admin", { exact: true })).toBeVisible();
    await expect(guest.getByRole("link", { name: "Tim" })).toHaveCount(0);

    await page.reload();
    await expect(status).toContainText("Terakhir masuk");
    // Turun role → konfirmasi dulu.
    await role.click();
    await page.getByRole("option", { name: "Crew" }).click();
    await page.getByRole("button", { name: "Jadikan Crew" }).click();
    await expect(role).toHaveText("Crew");

    await menu("Nonaktifkan");
    await page.getByRole("dialog").getByRole("button", { name: "Nonaktifkan" }).click();
    await expect(status).toContainText("Nonaktif");
    await guest.reload();
    await expect(guest).toHaveURL(/\/admin\/login\?e=akses/);

    await menu("Hapus dari tim");
    await page.getByRole("dialog").getByRole("button", { name: "Hapus dari tim" }).click();
    await expect(row).toHaveCount(0);
    await page.screenshot({ path: "test-results/admin-team.png", fullPage: true });
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

for (const r of ["admin", "crew"] as const)
  test(`${r} tidak bisa membuka Tim`, async ({ page }) => {
    const u = await makeUser(r);
    try {
      await login(page, u);
      await expect(page.getByRole("link", { name: "Tim" })).toHaveCount(0);
      await page.goto("/admin/team");
      await expect(page).toHaveURL(/\/admin\/login\?e=akses/);
    } finally {
      await u.cleanup();
    }
  });
