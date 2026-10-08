import { expect, test } from "@playwright/test";
import { newSessionId } from "@tetra/shared";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** #215: kartu promosi tamu → nomor WA (lead sales) → bukti → kode promo; API Hermes; promo mati per event. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");
test.use({ viewport: { width: 390, height: 844 } });

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";
const HERMES = { authorization: "Bearer e2e-hermes-token-0123456789abcdef0123" };
const OPS = { authorization: "Bearer e2e-ops-api-token" };
// 1×1 PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("kartu promosi: WA → bukti ulasan → kode, Hermes menarik lead, promo mati per event", async ({
  page,
  request,
}) => {
  const org = (await db.from("organizations").select("id, promo").eq("slug", "tetra").single())
    .data;
  const orgId = org?.id ?? "";
  const device =
    (await db.from("devices").select("id").eq("organization_id", orgId).limit(1).single()).data
      ?.id ?? "";
  const sid = newSessionId();
  // Nomor acak: satu nomor = satu lead sales per org.
  const phone = `0812${Math.floor(1e7 + Math.random() * 9e7)}`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: orgId,
      name: "e2e promosi tamu",
      mode: "event",
      event_date: "2026-10-12",
      guest_expires_at: "2099-01-01T00:00:00Z",
      client_instagram: ["dimas.rina", "wo.bahagia"],
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  try {
    // Pengaturan asli Tetra dikembalikan di finally (dev = prod).
    await db
      .from("organizations")
      .update({
        promo: {
          whatsapp: "6281200000000",
          instagram: "tetraphotobooth",
          reviewUrl: "https://g.page/r/e2e/review",
          offer: {
            discount: { type: "percent", value: 10, maxIdr: 300000 },
            minIdr: 2000000,
            validDays: 90,
            proofs: ["instagram", "review"],
          },
        },
      })
      .eq("id", orgId);
    await db.from("sessions").insert({
      id: sid,
      organization_id: orgId,
      event_id: eventId,
      device_id: device,
      started_at: "2026-10-12T12:10:00Z",
      upload_status: "complete",
    });
    await db.from("assets").insert(
      (["strip_web_0", "thumb_strip_0"] as const).map((f) => ({
        organization_id: orgId,
        session_id: sid,
        kind: f.replace(/_\d$/, ""),
        idx: 0,
        r2_key: `${R2}/${f}.jpg#${sid}`,
      })),
    );

    await page.goto(`/s/${sid}`);
    const card = page.getByTestId("guest-promo");
    await expect(card).toContainText("@dimas.rina");
    await expect(card).toContainText("@wo.bahagia");
    await expect(card).toContainText("@tetraphotobooth");
    await expect(card.getByRole("link", { name: "Beri ulasan Google" })).toHaveAttribute(
      "href",
      "https://g.page/r/e2e/review",
    );
    await card.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/promo-card.png" });
    await card.getByRole("button", { name: "Klaim Diskon 10% booking" }).click();
    const sheet = page.getByTestId("promo-sheet");
    await sheet.getByLabel("Nomor WhatsApp").fill(phone);
    await sheet.getByRole("button", { name: "Kirim nomorku" }).click();
    await expect(sheet.getByRole("alert")).toContainText("centang persetujuan");
    await sheet.getByText(/Boleh dihubungi/).click();
    await sheet.getByRole("button", { name: "Kirim nomorku" }).click();
    await expect(sheet.getByRole("heading", { name: "Klaim Diskon 10% booking" })).toBeVisible();
    await sheet.getByText("Tulis ulasan di Google").click();
    await sheet.locator('input[type="file"]').setInputFiles({
      name: "bukti.png",
      mimeType: "image/png",
      buffer: PNG,
    });
    await sheet.getByRole("button", { name: "Klaim promo" }).click();
    await expect(sheet.getByTestId("promo-code")).toHaveText(/^TAMU-[A-Z2-9]{5}$/);
    await page.screenshot({ path: "test-results/promo-code.png" });
    const code = await sheet.getByTestId("promo-code").textContent();

    const wa = `62${phone.slice(1)}`;
    const { data: lead } = await db
      .from("leads")
      .select("id, kind, proof_kind, proof_key, promo_code, event_id")
      .eq("organization_id", orgId)
      .eq("data->>whatsapp", wa)
      .single();
    expect(lead).toMatchObject({
      kind: "sales",
      proof_kind: "review",
      promo_code: code,
      event_id: eventId,
    });
    expect(lead?.proof_key).toContain(`${orgId}/promo/`);

    // Buka lagi: langsung menampilkan kode yang sama (tersimpan di browser).
    await page.reload();
    await page.getByTestId("guest-promo").getByRole("button").last().click();
    await expect(page.getByTestId("promo-code")).toHaveText(code ?? "");
    await page.getByRole("button", { name: "Tutup" }).click();

    // Hermes: tanpa token 401; dengan token lead ada; laporan status tersimpan.
    expect((await request.get("/api/hermes/leads")).status()).toBe(401);
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const list = await request.get(`/api/hermes/leads?since=${encodeURIComponent(since)}`, {
      headers: HERMES,
    });
    expect(list.status()).toBe(200);
    const mine = (await list.json()).leads.find((l: { id: string }) => l.id === lead?.id);
    expect(mine).toMatchObject({
      whatsapp: wa,
      promo_code: code,
      promo_reward: "Diskon 10% booking",
      promo_state: "valid",
      booking_url: `https://booking.tetraphoto.com/?promo=${code}`,
      proof: "review",
      status: "new",
      event: { name: "e2e promosi tamu" },
    });
    const patch = await request.patch(`/api/hermes/leads/${lead?.id}`, {
      headers: HERMES,
      data: { status: "sent" },
    });
    expect(patch.status()).toBe(200);
    const after = await db
      .from("leads")
      .select("contact_status, contacted_at")
      .eq("id", lead?.id ?? "")
      .single();
    expect(after.data?.contact_status).toBe("sent");
    expect(after.data?.contacted_at).toBeTruthy();

    // #218 Ops: cek kode (nilai dibekukan), pakai saat DP, idempoten, booking lain ditolak, lepas saat batal.
    expect((await request.get(`/api/ops/promo/${code}`)).status()).toBe(401);
    const check = async (q = "") =>
      (await request.get(`/api/ops/promo/${code}${q}`, { headers: OPS })).json();
    expect(await check(`?whatsapp=${phone}`)).toMatchObject({
      valid: true,
      reason: null,
      label: "Diskon 10% booking",
      discount: { type: "percent", value: 10, max_idr: 300000 },
      min_idr: 2000000,
      whatsapp_match: true,
    });
    expect((await check("?whatsapp=081200000001")).whatsapp_match).toBe(false);
    expect(await check().then((r) => r.valid)).toBe(true);
    expect(
      (await (await request.get("/api/ops/promo/TAMU-ZZZZZ", { headers: OPS })).json()).reason,
    ).toBe("not_found");
    const redeem = (project: string, method: "post" | "delete" = "post") =>
      request[method](`/api/ops/promo/${code}/redeem`, {
        headers: OPS,
        data: { project_id: project },
      });
    expect((await redeem("PRJ-E2E-1")).status()).toBe(200);
    expect((await redeem("PRJ-E2E-1")).status()).toBe(200);
    const other = await redeem("PRJ-E2E-2");
    expect(other.status()).toBe(409);
    expect((await other.json()).reason).toBe("redeemed");
    expect(await check()).toMatchObject({
      valid: false,
      reason: "redeemed",
      redeemed_project_id: "PRJ-E2E-1",
    });
    expect((await redeem("PRJ-E2E-2", "delete")).status()).toBe(409);
    expect((await redeem("PRJ-E2E-1", "delete")).status()).toBe(200);
    expect((await check()).valid).toBe(true);
    // Admin menolak bukti → kode tidak berlaku.
    await db
      .from("leads")
      .update({ promo_rejected_at: new Date().toISOString() })
      .eq("id", lead?.id ?? "");
    expect(await check()).toMatchObject({ valid: false, reason: "rejected" });

    // Promo dimatikan untuk event ini → kartu hilang.
    await db.from("events").update({ promo_off: true }).eq("id", eventId);
    await page.reload();
    await expect(page.getByRole("button", { name: "Simpan ke Galeri HP" })).toBeVisible();
    await expect(page.getByTestId("guest-promo")).toHaveCount(0);
  } finally {
    await db
      .from("organizations")
      .update({ promo: org?.promo ?? {} })
      .eq("id", orgId);
    await db.from("events").delete().eq("id", eventId);
  }
});

test("admin Promosi: simpan akun & diskon nominal; crew tidak melihat menunya", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const admin = await makeUser("admin");
  const before = (await db.from("organizations").select("promo").eq("id", admin.org).single()).data;
  try {
    await login(page, admin);
    await page.getByRole("link", { name: "Promosi" }).click();
    await page.getByLabel("WhatsApp admin").fill("0812 0000 0000");
    await page.getByLabel("Instagram").fill("@TetraPhotobooth");
    await page.getByLabel("Link ulasan Google").fill("https://g.page/r/e2e/review");
    await page.getByText("Promo tamu: tinggalkan nomor WA").click();
    await page.getByText("Potongan nominal").click();
    await page.getByLabel("Potongan (Rp)").fill("200.000");
    await page.getByLabel("Berlaku (hari)").fill("30");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByRole("status")).toHaveText("Tersimpan");
    const saved = (await db.from("organizations").select("promo").eq("id", admin.org).single())
      .data;
    expect(saved?.promo).toMatchObject({
      whatsapp: "6281200000000",
      instagram: "tetraphotobooth",
      reviewUrl: "https://g.page/r/e2e/review",
      offer: { discount: { type: "amount", value: 200000 }, validDays: 30 },
    });
    // Setelah simpan (form di-reset React), pilihan tetap sesuai yang tersimpan.
    await expect(page.getByRole("radio", { name: "Potongan nominal" })).toBeChecked();
    await page.screenshot({ path: "test-results/admin-promo.png", fullPage: true });
  } finally {
    await db
      .from("organizations")
      .update({ promo: before?.promo ?? {} })
      .eq("id", admin.org);
    await admin.cleanup();
  }
  const crew = await makeUser("crew");
  try {
    await login(page, crew);
    await expect(page.getByRole("link", { name: "Promosi" })).toHaveCount(0);
  } finally {
    await crew.cleanup();
  }
});
