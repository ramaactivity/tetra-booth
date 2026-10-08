import type { Json } from "@tetra/db";
import { BIZ_CARDS } from "@/lib/biz-card";
import {
  nextOpsSync,
  type OpsSync,
  OpsWebhookBody,
  opsOrgId,
  opsSignatureOk,
} from "@/lib/ops-sync";
import { createServiceClient } from "@/lib/supabase/service";
import { opsGuestCam, opsInstagram } from "@/lib/tetra-ops";

/**
 * Kabar dari Tetra Ops (kontrak v0.2 §4, DECISIONS #173): verifikasi HMAC + jendela waktu, simpan per
 * `delivery_id` (kiriman ulang = 200 tanpa proses ulang), lalu beri tanda `events.ops_sync` pada event Booth yang
 * diimpor dari booking itu. Tidak membuat atau menghapus event; admin yang memutuskan.
 */
export async function POST(req: Request) {
  const secret = process.env.TETRA_OPS_WEBHOOK_SECRET ?? "";
  const org = opsOrgId();
  if (!secret || !org) return new Response("not configured", { status: 503 });
  const raw = await req.text();
  if (!opsSignatureOk(raw, req.headers.get("x-tetra-signature"), secret, Date.now() / 1000))
    return new Response("unauthorized", { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const parsed = OpsWebhookBody.safeParse(json);
  if (!parsed.success) return new Response("bad request", { status: 400 });
  const body = parsed.data;
  const projectId = body.booking.project_id;

  const db = createServiceClient();
  const { data: seen } = await db
    .from("ops_webhook_deliveries")
    .select("delivery_id")
    .eq("delivery_id", body.delivery_id)
    .eq("organization_id", org)
    .maybeSingle();
  if (seen) return Response.json({ ok: true, duplicate: true });

  // Tandai dulu, catat delivery sesudahnya: kalau tanda gagal, kiriman ulang Ops memproses lagi (nextOpsSync idempoten).
  const { data: events, error } = await db
    .from("events")
    .select("id, ops_sync, client_instagram, settings")
    .eq("organization_id", org)
    .eq("ops_project_id", projectId);
  if (error) return new Response("server error", { status: 500 });
  // ponytail: baca-lalu-tulis per event (jarang > 3 spot); kabar bersamaan untuk event yang sama bisa saling timpa.
  // IG klien (#215, kontrak v0.7) mengisi event yang belum punya; isian admin di Booth tidak ditimpa.
  // ponytail: perubahan IG di Ops setelah terisi tidak ikut; admin mengubahnya di pengaturan event.
  const ig = opsInstagram(body.booking.client_instagram);
  // Paket Guest Cam (tier, cetak) + desain kartu QR pilihan klien (#225/#226, kontrak v0.9).
  const gc = opsGuestCam(
    body.booking,
    BIZ_CARDS.map((c) => c.id),
  );
  for (const ev of events ?? []) {
    const prev = (ev.ops_sync ?? {}) as OpsSync;
    const next = nextOpsSync(prev, body);
    const fillIg = ig.length > 0 && !ev.client_instagram.length;
    const settings = (ev.settings ?? {}) as { guestCam?: Record<string, unknown> };
    const setGc = Object.entries(gc).some(([k, v]) => settings.guestCam?.[k] !== v);
    if (next === prev && !fillIg && !setGc) continue;
    const { error: upd } = await db
      .from("events")
      .update({
        ops_sync: next as unknown as NonNullable<Json>,
        ...(fillIg && { client_instagram: ig }),
        ...(setGc && { settings: { ...settings, guestCam: { ...settings.guestCam, ...gc } } }),
      })
      .eq("id", ev.id)
      .eq("organization_id", org);
    if (upd) return new Response("server error", { status: 500 });
  }
  const { error: log } = await db.from("ops_webhook_deliveries").upsert(
    {
      delivery_id: body.delivery_id,
      organization_id: org,
      event: body.event,
      project_id: projectId,
      occurred_at: body.occurred_at,
      payload: json as NonNullable<Json>,
    },
    { onConflict: "delivery_id", ignoreDuplicates: true },
  );
  if (log) return new Response("server error", { status: 500 });
  return Response.json({ ok: true, events: events?.length ?? 0 });
}
