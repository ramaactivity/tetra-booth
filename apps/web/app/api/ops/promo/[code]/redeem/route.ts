import { z } from "zod";
import { opsCaller } from "@/lib/ops-sync";
import { CODE, codeState, PROMO_LEAD } from "@/lib/promo";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ project_id: z.string().regex(/^[\w-]{1,64}$/) });

async function target(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const org = opsCaller(req);
  if (org instanceof Response) return org;
  const code = (await ctx.params).code.toUpperCase();
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!CODE.test(code) || !body.success) return new Response("bad request", { status: 400 });
  const db = createServiceClient();
  const { data: l } = await db
    .from("leads")
    .select(PROMO_LEAD)
    .eq("organization_id", org)
    .eq("kind", "sales")
    .eq("promo_code", code)
    .maybeSingle();
  if (!l?.promo) return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
  return { db, org, l, project: body.data.project_id };
}

/**
 * Kode dipakai (#218): Ops memanggil saat DP booking diterima. Idempoten untuk project yang sama; project lain atau
 * kode tidak berlaku → 409 + `reason`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const t = await target(req, ctx);
  if (t instanceof Response) return t;
  const { db, org, l, project } = t;
  if (l.redeemed_project_id === project)
    return Response.json({ ok: true, redeemed_at: l.redeemed_at });
  const state = codeState(l);
  if (state !== "valid") return Response.json({ ok: false, reason: state }, { status: 409 });
  const now = new Date().toISOString();
  // Bersyarat `redeemed_at is null`: dua booking bersamaan → hanya satu yang menang.
  const { data } = await db
    .from("leads")
    .update({ redeemed_at: now, redeemed_project_id: project, contact_status: "converted" })
    .eq("id", l.id)
    .eq("organization_id", org)
    .is("redeemed_at", null)
    .select("id")
    .maybeSingle();
  if (!data) return Response.json({ ok: false, reason: "redeemed" }, { status: 409 });
  return Response.json({ ok: true, redeemed_at: now });
}

/** Booking batal setelah DP: kode bisa dipakai lagi (hanya oleh project yang memakainya). Idempoten. */
export async function DELETE(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const t = await target(req, ctx);
  if (t instanceof Response) return t;
  const { db, org, l, project } = t;
  if (!l.redeemed_project_id) return Response.json({ ok: true });
  if (l.redeemed_project_id !== project)
    return Response.json({ ok: false, reason: "other_project" }, { status: 409 });
  await db
    .from("leads")
    .update({ redeemed_at: null, redeemed_project_id: null })
    .eq("id", l.id)
    .eq("organization_id", org);
  return Response.json({ ok: true });
}
