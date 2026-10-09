import { z } from "zod";
import { HERMES_STATUSES, hermesOrg } from "@/lib/hermes";
import type { ProofCheck } from "@/lib/proof-check";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z
  .object({
    status: z.enum(HERMES_STATUSES).optional(),
    /** #219: Bruno memeriksa screenshot bukti; `rejected` = kode promo tidak berlaku. */
    proof: z.enum(["ok", "rejected"]).optional(),
    note: z.string().max(300).optional(),
  })
  .refine((b) => b.status || b.proof);

/**
 * Hermes melaporkan status kontak lead (#215) dan/atau hasil cek bukti promo (#219). Idempoten; `opted_out` = jangan
 * dihubungi lagi.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const org = hermesOrg(req);
  if (!org) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success)
    return Response.json({ error: "bad_request" }, { status: 400 });
  const { status, proof, note } = body.data;
  const now = new Date().toISOString();
  const { data, error } = await createServiceClient()
    .from("leads")
    .update({
      ...(status && { contact_status: status }),
      ...(status === "sent" && { contacted_at: now }),
      ...(proof && {
        proof_check: {
          verdict: proof,
          reason: note ?? (proof === "ok" ? "Dicek Bruno" : "Ditolak Bruno"),
          by: "bruno",
          at: now,
        } satisfies ProofCheck,
        promo_rejected_at: proof === "rejected" ? now : null,
      }),
    })
    .eq("id", id)
    .eq("organization_id", org)
    .eq("kind", "sales")
    .select("id")
    .maybeSingle();
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json({ ok: true });
}
