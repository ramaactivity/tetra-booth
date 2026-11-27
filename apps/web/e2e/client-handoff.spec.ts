import { expect, test } from "@playwright/test";
import { db, hasDb, login, makeUser } from "./admin-helpers";

/** Serah terima ke klien (audit 27 Nov): Kirim ke WA, "Dibuka klien" tanpa robot pratinjau & tim, cabut 2 ketukan. */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

const PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";

test("kirim galeri ke WA klien, galeri dibuka klien tercatat, cabut dua ketukan", async ({
  page,
  browser,
}) => {
  const u = await makeUser("owner");
  const tag = String(Date.now()).slice(-6);
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e serah ${tag}`,
      mode: "event",
      event_date: "2026-11-20",
      client_token: `e2eclient${tag}xxxxxxxxxx`,
      branding: { clientName: "Rina & Dimas" },
    })
    .select("id, slug")
    .single();
  const eventId = ev?.id ?? "";
  try {
    await login(page, u);
    await page.goto(`/admin/events/${eventId}`);
    const links = page.getByRole("region", { name: "Link untuk dibagikan" });
    await expect(links.getByTestId("client-seen")).toHaveText("Belum dibuka klien");
    const wa = links.getByRole("link", { name: "Kirim ke WA" });
    const href = new URL((await wa.getAttribute("href")) ?? "");
    expect(href.origin + href.pathname).toBe("https://wa.me/");
    const text = href.searchParams.get("text") ?? "";
    expect(text).toContain("Halo Kak Rina & Dimas");
    expect(text).toMatch(new RegExp(`/g/${ev?.slug}-[\\w-]{6}`));

    // Tim yang login membuka galeri (tombol Buka): tidak dihitung.
    await page.goto(`/g/${ev?.slug}`);
    await expect(page.getByText("Galeri privat").first()).toBeVisible();
    // Robot pratinjau link WA: tidak dihitung. Klien di HP: dihitung.
    for (const ua of ["WhatsApp/2.24.1 A", PHONE]) {
      const ctx = await browser.newContext({ userAgent: ua });
      const p = await ctx.newPage();
      await p.goto(`/g/${ev?.slug}`);
      await ctx.close();
    }
    await expect
      .poll(
        async () =>
          (
            await db
              .from("analytics_events")
              .select("id")
              .eq("event_id", eventId)
              .eq("type", "gallery_open")
          ).data?.length,
      )
      .toBe(1);
    await page.goto(`/admin/events/${eventId}`);
    await expect(links.getByTestId("client-seen")).toContainText("Dibuka klien 1× · terakhir");
    await page.screenshot({ path: "test-results/client-handoff.png", fullPage: true });

    // Cabut: ketukan pertama hanya minta yakin, kedua mencabut.
    await links.getByRole("button", { name: "Cabut" }).first().click();
    await expect(links.getByRole("button", { name: "Yakin cabut?" })).toBeVisible();
    expect(
      (await db.from("events").select("client_token").eq("id", eventId).single()).data
        ?.client_token,
    ).toBeTruthy();
    await links.getByRole("button", { name: "Yakin cabut?" }).click();
    await expect(links.getByTestId("link-client")).toContainText("Link belum aktif");
  } finally {
    await db.from("audit_logs").delete().eq("target", eventId);
    await db.from("events").delete().eq("id", eventId);
    await u.cleanup();
  }
});

test("galeri klien acara baru: slug saja ditolak, slug + kode dan token lama dibuka", async ({
  request,
}) => {
  const u = await makeUser(null);
  const tag = String(Date.now()).slice(-6);
  const token = `e2ekode${tag}xxxxxxxxxxxxxx`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: u.org,
      name: `e2e kode ${tag}`,
      mode: "event",
      event_date: "2026-12-05",
      client_token: token,
    })
    .select("id, slug")
    .single();
  try {
    const status = async (p: string) =>
      (await request.get(p, { headers: { "user-agent": "HeadlessChrome e2e" } })).text();
    expect(await status(`/g/${ev?.slug}`)).toContain("Galeri tidak tersedia");
    expect(await status(`/g/${ev?.slug}-${token.slice(0, 6)}`)).not.toContain(
      "Galeri tidak tersedia",
    );
    expect(await status(`/g/${ev?.slug}-xxxxxx`)).toContain("Galeri tidak tersedia");
    expect(await status(`/g/${token}`)).not.toContain("Galeri tidak tersedia");
    const zip = await request.get(`/api/g/${ev?.slug}/zip?kind=strip`, {
      headers: { "user-agent": "HeadlessChrome e2e" },
    });
    expect(zip.ok()).toBe(false);
  } finally {
    await db
      .from("events")
      .delete()
      .eq("id", ev?.id ?? "");
    await u.cleanup();
  }
});
