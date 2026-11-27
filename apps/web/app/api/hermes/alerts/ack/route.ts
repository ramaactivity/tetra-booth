import { z } from "zod";
import { hermesOrg } from "@/lib/hermes";
import { createServiceClient } from "@/lib/supabase/service";

const Body = z.object({ ids: z.array(z.string().min(1).max(200)).min(1).max(100) });

/** Hermes sudah meneruskan alert ini ke WA: jangan dikirim lagi. Idempoten (ack ulang = 200). */
export async function POST(req: Request) {
  const org = hermesOrg(req);
  if (!org) return Response.json({ error: "unauthorized" }, { status: 401 });
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { error } = await createServiceClient()
    .from("alert_acks")
    .upsert(
      b.data.ids.map((id) => ({ organization_id: org, id })),
      { onConflict: "organization_id,id", ignoreDuplicates: true },
    );
  if (error) return Response.json({ error: "server_error" }, { status: 500 });
  return Response.json({ ok: true, acked: b.data.ids.length });
}
