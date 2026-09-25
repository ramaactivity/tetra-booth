import { requireMember } from "@/lib/supabase/server";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

/** Export lead CSV (FSD §5.3/§5.9): owner/admin, tercatat di audit log `lead.export`. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const { data: ev } = await db
    .from("events")
    .select("id, name")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) return new Response("not found", { status: 404 });
  const { data } = await db
    .from("leads")
    .select("created_at, session_id, data, consent_version, consent_at")
    .eq("event_id", id)
    .eq("organization_id", orgId)
    .order("created_at");
  const rows = data ?? [];
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: "lead.export",
    target: id,
    meta: { count: rows.length },
  });
  const head = ["waktu", "sesi", "nama", "whatsapp", "email", "versi_persetujuan", "setuju_pada"];
  const lines = rows.map((r) => {
    const d = (r.data ?? {}) as Record<string, string>;
    return [
      r.created_at,
      r.session_id,
      d.name,
      d.whatsapp,
      d.email,
      r.consent_version,
      r.consent_at,
    ]
      .map(cell)
      .join(",");
  });
  const slug = ev.name.replace(/[^\w-]+/g, "-").toLowerCase();
  return new Response(`${[head.join(","), ...lines].join("\n")}\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lead-${slug}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
