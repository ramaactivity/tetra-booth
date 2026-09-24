import "server-only";
import { LAYOUT_PRESETS, type PresetId } from "@tetra/shared";
import { requireMember } from "@/lib/supabase/server";

/** Filter E6: rentang tanggal WIB (default 7 hari terakhir) + event. */
export type TxFilter = { from: string; to: string; event: string };

const wibDate = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);

export function parseFilter(q: Record<string, string | string[] | undefined>): TxFilter {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const pick = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const to = day.test(pick("to")) ? pick("to") : wibDate(new Date());
  const from = day.test(pick("from"))
    ? pick("from")
    : wibDate(new Date(Date.now() - 6 * 86_400_000));
  return { from, to, event: /^[0-9a-f-]{36}$/.test(pick("event")) ? pick("event") : "" };
}

export const layoutName = (k: string | null) =>
  (k && LAYOUT_PRESETS[k as PresetId]?.name) || (k ?? "—");

/** Transaksi organisasi (RLS: owner/admin, halaman Transaksi E6). */
export async function loadTransactions(f: TxFilter) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  let q = db
    .from("payments")
    .select(
      "id, created_at, paid_at, kind, prints, amount_idr, status, layout_key, session_id, events(id, name), devices(name)",
    )
    .eq("organization_id", orgId)
    .gte("created_at", new Date(`${f.from}T00:00:00+07:00`).toISOString())
    .lt(
      "created_at",
      new Date(new Date(`${f.to}T00:00:00+07:00`).getTime() + 86_400_000).toISOString(),
    )
    .order("created_at", { ascending: false })
    // ponytail: 2000 baris per rentang; paginasi kalau satu lokasi melewati itu.
    .limit(2000);
  if (f.event) q = q.eq("event_id", f.event);
  const { data } = await q;
  const { data: events } = await db
    .from("events")
    .select("id, name")
    .eq("organization_id", orgId)
    .eq("mode", "photobox")
    .order("event_date", { ascending: false });
  return { rows: data ?? [], events: events ?? [], day: wibDate };
}
