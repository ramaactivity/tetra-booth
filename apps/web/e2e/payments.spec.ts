import { expect, test } from "@playwright/test";
import { newSessionId } from "@tetra/shared";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Fase 4: tagihan QRIS photobox (provider palsu), harga dari server, webhook, simulasi, sesi tertaut, E6 + CSV. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("paket + tambahan cetak: harga server, webhook, lunas, sesi tertaut, transaksi", async ({
  request,
  page,
}) => {
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: org,
      name: "e2e photobox",
      short_code: `E2E-${code}`,
      pairing_code: code,
      pairing_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id")
    .single();
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: `e2e photobox ${code}`,
      mode: "photobox",
      event_date: "2026-10-12",
      settings: {
        maxPrints: 3,
        photobox: { layouts: [{ preset: "4r-grid", price: 35000 }], extraPrintPrice: 10000 },
      },
    })
    .select("id")
    .single();
  const owner = await makeUser("owner");
  const sessionId = newSessionId();
  try {
    await db
      .from("event_devices")
      .insert({ organization_id: org, event_id: ev?.id ?? "", device_id: dev?.id ?? "" });
    const pair = await request.post("/api/booth/pair", {
      headers: { "x-forwarded-for": `e2e-pb-${code}` },
      data: { code },
    });
    const auth = { Authorization: `Bearer ${(await pair.json()).token}` };
    const create = (data: object) => request.post("/api/booth/payments", { headers: auth, data });
    const base = { eventId: ev?.id, sessionId, layoutId: "4r-grid" };

    expect((await create({ ...base, layoutId: "strip-3" })).status()).toBe(400);
    expect((await create({ ...base, extraPrints: 3 })).status()).toBe(400);
    const pkg = await create(base);
    expect(pkg.status()).toBe(200);
    const p1 = await pkg.json();
    expect(p1).toMatchObject({ amount: 35000 });
    expect(p1.qrString).toContain(p1.paymentId);
    const status = async (id: string) =>
      (await (await request.get(`/api/booth/payments/${id}`, { headers: auth })).json()).status;
    expect(await status(p1.paymentId)).toBe("pending");

    const hook = (token: string) =>
      request.post("/api/webhooks/xendit", {
        headers: { "x-callback-token": token },
        data: {
          event: "payment.succeeded",
          data: { reference_id: p1.paymentId, status: "SUCCEEDED" },
        },
      });
    expect((await hook("salah")).status()).toBe(401);
    // Isi webhook tidak dipercaya: provider belum lunas → tetap pending.
    expect((await (await hook("e2e-callback-token")).json()).status).toBe("pending");
    const sim = await request.post(`/api/booth/payments/${p1.paymentId}/simulate`, {
      headers: auth,
    });
    expect((await sim.json()).status).toBe("paid");
    expect(await status(p1.paymentId)).toBe("paid");

    const extra = await (await create({ ...base, extraPrints: 2 })).json();
    expect(extra.amount).toBe(20000);

    const up = await request.post("/api/booth/sessions", {
      headers: auth,
      data: {
        id: sessionId,
        eventId: ev?.id,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        photoCount: 4,
        retakeCount: 0,
        printCount: 3,
        assetCount: 4,
        paymentId: p1.paymentId,
      },
    });
    expect(up.status()).toBe(200);
    const s = (await db.from("sessions").select("payment_id").eq("id", sessionId).single()).data;
    expect(s?.payment_id).toBe(p1.paymentId);

    await login(page, owner);
    await page.getByRole("link", { name: "Transaksi" }).click();
    await page.getByLabel("Event").selectOption(ev?.id ?? "");
    await page.getByRole("button", { name: "Terapkan" }).click();
    await expect(page.getByTestId("tx-row")).toHaveCount(2);
    await expect(page.getByTestId("stat-Omzet")).toHaveText("Rp 35.000");
    await expect(page.getByTestId("tx-row").filter({ hasText: "+2 lembar" })).toContainText(
      "Menunggu",
    );
    await page.screenshot({ path: "test-results/admin-transactions.png", fullPage: true });
    const csv = await (
      await page.request.get(
        `/admin/transactions/export?event=${ev?.id}&from=2020-01-01&to=2099-01-01`,
      )
    ).text();
    expect(csv.split("\n")[0]).toContain("nominal_idr");
    expect(csv).toContain("35000");
  } finally {
    await db.from("sessions").delete().eq("id", sessionId);
    await db
      .from("payments")
      .delete()
      .eq("event_id", ev?.id ?? "");
    await db
      .from("event_devices")
      .delete()
      .eq("event_id", ev?.id ?? "");
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
    await owner.cleanup();
  }
});
