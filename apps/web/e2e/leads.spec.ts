import { expect, test } from "@playwright/test";
import { newSessionId } from "@tetra/shared";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Fase 5 L1: lead capture (B4) gate & optional di HP, lalu export CSV dari admin + audit log. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const R2 =
  "ba9df22f-5abc-4322-ab3b-9a3f4b00e481/420501ec-bf9a-45e5-9142-2edd10e0889d/sessions/jmC2zeLmdG";
const CONSENT = "Saya setuju data saya dipakai Tetra Photobooth untuk info promo.";
const events: string[] = [];
const ids = { gate: newSessionId(), optional: newSessionId() };
let org = "";

test.beforeAll(async () => {
  org = (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const device =
    (
      await db
        .from("devices")
        .select("id")
        .eq("organization_id", org)
        .eq("short_code", "B01")
        .single()
    ).data?.id ?? "";
  for (const mode of ["gate", "optional"] as const) {
    const { data: ev } = await db
      .from("events")
      .insert({
        organization_id: org,
        name: `e2e lead ${mode}`,
        mode: "event",
        event_date: "2026-10-12",
        guest_expires_at: "2099-01-01T00:00:00Z",
        lead_capture: {
          enabled: true,
          mode,
          fields: ["name", "whatsapp"],
          consentText: CONSENT,
          consentVersion: "v-e2e",
        },
      })
      .select("id")
      .single();
    events.push(ev?.id ?? "");
    await db.from("sessions").insert({
      id: ids[mode],
      organization_id: org,
      event_id: ev?.id ?? "",
      device_id: device,
      started_at: "2026-10-12T14:42:00Z",
      asset_count: 1,
      upload_status: "complete",
    });
    await db.from("assets").insert({
      organization_id: org,
      session_id: ids[mode],
      kind: "strip_web",
      idx: 0,
      r2_key: `${R2}/strip_web_0.jpg#${ids[mode]}`,
    });
  }
});

test.afterAll(async () => {
  for (const e of events) await db.from("events").delete().eq("id", e);
});

test.describe("tamu (HP)", () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });

  test("gate: URL foto tidak dikirim sebelum lead; consent & nomor divalidasi; lalu foto tampil", async ({
    page,
  }) => {
    await page.goto(`/s/${ids.gate}`);
    await expect(page.getByRole("heading", { name: "Satu langkah lagi" })).toBeVisible();
    expect(await page.content()).not.toContain("strip_web_0.jpg");
    await expect(page.getByRole("button", { name: "Lewati" })).toHaveCount(0);
    await page.screenshot({ path: "test-results/lead-gate.png" });

    await page.getByLabel("Nama").fill("Sari Wulandari");
    await page.getByLabel("Nomor WhatsApp").fill("0812-3456-7890");
    await page.getByRole("button", { name: "Lihat Fotoku" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "persetujuan" })).toBeVisible();
    await page.getByText(CONSENT).click();
    await page.getByLabel("Nomor WhatsApp").fill("12");
    await page.getByRole("button", { name: "Lihat Fotoku" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Periksa lagi" })).toBeVisible();
    await page.getByLabel("Nomor WhatsApp").fill("0812-3456-7890");
    await page.getByRole("button", { name: "Lihat Fotoku" }).click();
    await expect(page.getByRole("button", { name: "Simpan ke Galeri HP" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Satu langkah lagi" })).toHaveCount(0);

    const { data } = await db
      .from("leads")
      .select("data, consent_version")
      .eq("session_id", ids.gate);
    expect(data).toEqual([
      { data: { name: "Sari Wulandari", whatsapp: "6281234567890" }, consent_version: "v-e2e" },
    ]);
    await page.reload();
    await expect(page.getByRole("button", { name: "Simpan ke Galeri HP" })).toBeVisible();
  });

  test("optional: foto langsung ada, Lewati menutup form dan diingat", async ({ page }) => {
    await page.goto(`/s/${ids.optional}`);
    await expect(page.getByRole("heading", { name: "Satu langkah lagi" })).toBeVisible();
    expect(await page.content()).toContain("strip_web_0.jpg");
    await page.getByRole("button", { name: "Lewati" }).click();
    await expect(page.getByRole("heading", { name: "Satu langkah lagi" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Simpan ke Galeri HP" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Satu langkah lagi" })).toHaveCount(0);
  });
});

test("admin: export lead CSV tercatat di audit log", async ({ page }) => {
  const owner = await makeUser("owner");
  try {
    await login(page, owner);
    await page.goto(`/admin/events/${events[0]}`);
    const link = page.getByRole("link", { name: "Export Lead (1)" });
    await expect(link).toBeVisible();
    const csv = await (await page.request.get((await link.getAttribute("href")) ?? "")).text();
    expect(csv.split("\n")[0]).toBe("waktu,sesi,nama,whatsapp,email,versi_persetujuan,setuju_pada");
    expect(csv).toContain(`${ids.gate},Sari Wulandari,6281234567890,,v-e2e`);
    const { data: log } = await db
      .from("audit_logs")
      .select("action, meta")
      .eq("target", events[0] ?? "")
      .eq("actor_user_id", owner.id);
    expect(log).toEqual([{ action: "lead.export", meta: { count: 1 } }]);
  } finally {
    await db.from("audit_logs").delete().eq("actor_user_id", owner.id);
    await owner.cleanup();
  }
});
