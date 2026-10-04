import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/**
 * A2: tambah booth lewat panel bertahap (nama → kode → petunjuk booth → tersambung otomatis) → status booth
 * → sambungkan ulang (laptop diganti) → nonaktifkan dengan konfirmasi.
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("tambah booth bertahap, tersambung, status online, sambung ulang, nonaktifkan", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const u = await makeUser("owner");
  const name = `e2e booth ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const pairWith = async (code: string, tag: string) => {
    const r = await request.post("/api/booth/pair", {
      headers: { "x-forwarded-for": `e2e-admin-${tag}-${code}` },
      data: { code },
    });
    expect(r.status()).toBe(200);
    return (await r.json()).token as string;
  };
  try {
    await login(page, u);
    await page.getByRole("link", { name: "Device" }).click();
    await page.getByRole("button", { name: "+ Tambah booth" }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah booth" });
    await expect(dialog.getByTestId("pair-step-name")).toHaveAttribute("data-state", "active");
    await page.screenshot({ path: "test-results/admin-pair-1-name.png" });
    await dialog.getByPlaceholder("mis. Booth Iqbal").fill(name);
    await dialog.getByRole("button", { name: "Buat kode" }).click();
    const value = dialog.getByTestId("pair-code-value");
    await expect(value).toHaveText(/^\d{6}$/);
    const code = (await value.textContent()) ?? "";
    await expect(dialog.getByTestId("pair-countdown")).toHaveText(/^Berlaku (10:00|9:\d\d)$/);
    await expect(dialog.getByTestId("pair-step-booth")).toContainText("Ctrl+Shift+M");
    await expect(dialog.getByTestId("pair-step-booth")).toContainText("Sambungkan ke akun Tetra");
    await page.screenshot({ path: "test-results/admin-pair-2-code.png" });

    // Booth memakai kode → panel mendeteksi sendiri (poll) tanpa reload.
    let token = await pairWith(code, "new");
    await expect(dialog.getByTestId("pair-step-done")).toContainText(`${name} tersambung`, {
      timeout: 15_000,
    });
    await expect(dialog.getByRole("link", { name: "Buka daftar event" })).toBeVisible();
    await page.screenshot({ path: "test-results/admin-pair-3-done.png" });
    await dialog.getByRole("button", { name: "Selesai" }).click();
    await expect(dialog).toBeHidden();

    const beat = await request.post("/api/booth/heartbeat", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        appVersion: "9.9.9",
        status: {
          activeEvent: "andi-sari",
          activeEventName: "Andi & Sari",
          camera: { kind: "canon", connected: false, model: "Canon EOS 1500D" },
          printer: { name: "DNP DS-RX1", status: "error", message: "Paper end" },
          paper: { remaining: 12, capacity: 700 },
          failedPrints: 2,
          uploadPending: 3,
          lastError: "R2 PUT 503",
          diskFreeGb: 3.2,
        },
      },
    });
    expect(beat.status()).toBe(200);
    // Pantauan otomatis (tiap 20 dtk) tanpa reload manual.
    const card = page.getByTestId("device-card").filter({ hasText: name });
    await expect(card).toContainText("● Online", { timeout: 30_000 });
    await expect(card).toContainText("v9.9.9");
    await expect(card).toContainText("Andi & Sari");
    await expect(card).toContainText("Canon EOS 1500DTidak terhubung");
    await expect(card).toContainText("DNP DS-RX1Error");
    await expect(card).toContainText("12 / 700 · menipis");
    await expect(card).toContainText("3 file");
    await expect(card).toContainText("3.2 GB");
    const issues = card.getByTestId("device-issues");
    await expect(issues).toContainText("Kamera tidak terhubung");
    await expect(issues).toContainText("Kertas tinggal 12 lembar");
    await expect(issues).toContainText("2 cetak gagal");
    await expect(issues).toContainText("Upload tersendat: R2 PUT 503");
    await expect(issues).toContainText("Disk tinggal 3.2 GB");
    await page.screenshot({ path: "test-results/admin-devices.png", fullPage: true });

    // Sambungkan ulang (laptop diganti / instal ulang): panel yang sama, kode baru, alasan dijelaskan.
    await card.getByRole("button", { name: "Sambungkan ulang" }).click();
    const again = page.getByRole("dialog", { name: `Sambungkan ulang ${name}` });
    await expect(again).toContainText("laptop booth diganti");
    const code2 = (await again.getByTestId("pair-code-value").textContent()) ?? "";
    expect(code2).toMatch(/^\d{6}$/);
    await page.screenshot({ path: "test-results/admin-pair-4-reconnect.png" });
    const old = token;
    token = await pairWith(code2, "again");
    await expect(again.getByTestId("pair-step-done")).toContainText(`${name} tersambung`, {
      timeout: 15_000,
    });
    await again.getByRole("button", { name: "Selesai" }).click();
    const stale = await request.post("/api/booth/heartbeat", {
      headers: { Authorization: `Bearer ${old}` },
      data: { appVersion: "x" },
    });
    expect(stale.status()).toBe(401);

    await card.getByRole("button", { name: "Nonaktifkan" }).click();
    const confirm = page.getByRole("dialog", { name: `Nonaktifkan ${name}?` });
    await expect(confirm).toContainText("Foto dan sesi yang sudah terunggah tetap aman");
    await page.screenshot({ path: "test-results/admin-pair-5-deactivate.png" });
    await confirm.getByRole("button", { name: "Ya, nonaktifkan" }).click();
    await expect(page.getByTestId("device-card").filter({ hasText: name })).toHaveCount(0);
    const hb = await request.post("/api/booth/heartbeat", {
      headers: { Authorization: `Bearer ${token}` },
      data: { appVersion: "x" },
    });
    expect(hb.status()).toBe(401);
  } finally {
    await db.from("devices").delete().eq("name", name);
    await u.cleanup();
  }
});
