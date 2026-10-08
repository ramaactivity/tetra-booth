import { z } from "zod";
import { HERMES_STATUSES, hermesOrg } from "@/lib/hermes";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ status: z.enum(HERMES_STATUSES) });

/** Hermes melaporkan status kontak lead (#215). Idempoten; `opted_out` = jangan dihubungi lagi. */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const org = hermesOrg(req);
  if (!org) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!z.uuid().safeParse(id).success || !body.success)
    return Response.json({ error: "bad_request" }, { status: 400 });
  const { status } = body.data;
  const { data, error } = await createServiceClient()
    .from("leads")
    .update({
      contact_status: status,
      ...(status === "sent" && { contacted_at: new Date().toISOString() }),
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
