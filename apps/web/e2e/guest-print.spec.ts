import { type APIRequestContext, expect, test } from "@playwright/test";
import { db, hasDb } from "./admin-helpers";

/**
 * Cetak Guest Cam di printer booth (#223): satu tamu satu cetak, nomor antrean, booth mengambil sesuai kertasnya,
 * strip/polaroid dipasangkan dua tamu per lembar (tunggal ditahan 30 dtk), 4R langsung, hasil dilaporkan booth.
 * Event tanpa desain booth → frame bawaan Tetra boleh dicetak. Frame tamu disiapkan langsung di DB (tanpa R2).
 */
test.skip(!hasDb, "butuh Supabase dev (apps/web/.env.local)");

test("cetak tamu: antre → booth ambil berpasangan → hasil ke HP tamu", async ({
  playwright,
  baseURL,
  request,
}) => {
  const stamp = Date.now();
  const org =
    (await db.from("organizations").select("id").eq("slug", "tetra").single()).data?.id ?? "";
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const { data: dev } = await db
    .from("devices")
    .insert({
      organization_id: org,
      name: "e2e guest print",
      short_code: `E2P-${code}`,
      pairing_code: code,
      pairing_expires_at: new Date(Date.now() + 60_000).toISOString(),
    })
    .select("id")
    .single();
  const token = `e2e-gp-${stamp}`;
  const { data: ev } = await db
    .from("events")
    .insert({
      organization_id: org,
      name: "e2e guest print",
      mode: "event",
      event_date: "2026-12-31",
      guest_token: token,
      settings: { guestCam: { enabled: true, shots: 3, strip: true, print: true } },
    })
    .select("id")
    .single();
  const eventId = ev?.id ?? "";
  const base = `/api/c/${token}`;
  const phones: APIRequestContext[] = [];
  const guest = async (n: number, designId: string) => {
    const ctx = await playwright.request.newContext({
      baseURL: baseURL ?? "http://localhost:3000",
      extraHTTPHeaders: { "x-forwarded-for": `${token}-${n}` },
    });
    phones.push(ctx);
    const me = await (
      await ctx.post(`${base}/join`, {
        data: { name: `Tamu ${n}`, whatsapp: `08120000${stamp % 1000}${n}`, consent: true },
      })
    ).json();
    await db.from("assets").insert({
      organization_id: org,
      session_id: me.sessionId,
      kind: "strip_web",
      idx: 0,
      r2_key: `e2e/guest-print/${me.sessionId}.jpg`,
    });
    const print = () => ctx.post(`${base}/print`, { data: { idx: 0, designId } });
    return { ctx, print };
  };
  try {
    const pair = await request.post("/api/booth/pair", {
      headers: { "x-forwarded-for": `e2e-gp-${code}` },
      data: { code },
    });
    const auth = { Authorization: `Bearer ${(await pair.json()).token}` };
    const claim = async (paper: string) =>
      (
        await (
          await request.post(`/api/booth/events/${eventId}/guest-prints`, {
            headers: auth,
            data: { paper },
          })
        ).json()
      ).jobs as { id: string; number: number; guestName: string; url: string; layout: unknown }[];

    const a = await guest(1, "strip-3");
    // Frame belum ada di album → ditolak; frame ada → antre #1; ulang = sama (1 tamu 1 cetak).
    expect(
      (await a.ctx.post(`${base}/print`, { data: { idx: 1, designId: "strip-3" } })).status(),
    ).toBe(400);
    expect(await (await a.print()).json()).toEqual({ number: 1, status: "queued" });
    expect(await (await a.print()).json()).toEqual({ number: 1, status: "queued" });
    // Strip tunggal ditahan (menunggu pasangan) → booth belum dapat apa-apa.
    expect(await claim("2x6x2")).toEqual([]);
    const b = await guest(2, "strip-3");
    expect((await (await b.print()).json()).number).toBe(2);
    // Kertas lain tidak mengambil strip.
    expect(await claim("4R")).toEqual([]);
    const pairJobs = await claim("2x6x2");
    expect(pairJobs.map((j) => j.number).sort()).toEqual([1, 2]);
    expect(pairJobs[0]?.url).toMatch(/^https:\/\//);
    expect(pairJobs[0]?.layout).toMatchObject({ paper: "2x6x2" });
    expect(await claim("2x6x2")).toEqual([]);
    expect(await (await a.ctx.get(`${base}/print`)).json()).toEqual({
      number: 1,
      status: "claimed",
    });

    // Booth melapor: tamu 1 jadi, tamu 2 gagal.
    const [j1, j2] = [...pairJobs].sort((x, y) => x.number - y.number);
    const report = (id: string, status: string) =>
      request.post(`/api/booth/guest-prints/${id}`, { headers: auth, data: { status } });
    expect((await report(j1?.id ?? "", "printed")).status()).toBe(200);
    expect((await report(j2?.id ?? "", "failed")).status()).toBe(200);
    expect(await (await a.ctx.get(`${base}/print`)).json()).toEqual({
      number: 1,
      status: "printed",
    });
    expect((await (await b.ctx.get(`${base}/print`)).json()).status).toBe("failed");

    // 4R satu per lembar: langsung diambil tanpa menunggu pasangan.
    const c = await guest(3, "4r-grid");
    expect((await (await c.print()).json()).number).toBe(3);
    expect((await claim("4R")).map((j) => j.number)).toEqual([3]);

    // Add-on cetak mati → tidak bisa mencetak.
    await db
      .from("events")
      .update({ settings: { guestCam: { enabled: true, shots: 3, strip: true, print: false } } })
      .eq("id", eventId);
    const d = await guest(4, "strip-3");
    expect((await d.print()).status()).toBe(404);
  } finally {
    await Promise.all(phones.map((p) => p.dispose()));
    await db.from("events").delete().eq("id", eventId);
    await db
      .from("devices")
      .delete()
      .eq("id", dev?.id ?? "");
  }
});
