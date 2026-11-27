import Link from "next/link";
import { auditText } from "@/lib/audit-text";
import { authUsers } from "@/lib/auth-admin";
import { requireMember } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LIMIT = 300;
const WIB = { timeZone: "Asia/Jakarta" } as const;
const day = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  ...WIB,
});
const clock = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", ...WIB });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Riwayat perubahan (audit 27 Nov): siapa mengubah apa di event mana, dari `audit_logs` (sudah dicatat sejak awal,
 * baru sekarang ada halamannya). Owner & admin. Nama orang/event/booth, bukan kode.
 */
export default async function HistoryPage() {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const { data: logs } = await db
    .from("audit_logs")
    .select("id, actor_user_id, action, target, meta, created_at")
    .eq("organization_id", orgId)
    .order("created_at", { ascending: false })
    .limit(LIMIT);
  const rows = logs ?? [];
  const meta = (r: (typeof rows)[number]) => (r.meta ?? {}) as Record<string, unknown>;
  // Target: event (kebanyakan), sesi (meta.eventId), atau booth (device.*).
  const eventIds = new Set<string>();
  const deviceIds = new Set<string>();
  for (const r of rows) {
    const m = meta(r);
    if (r.action.startsWith("device.") && r.target) deviceIds.add(r.target);
    else if (r.action.startsWith("session.") && typeof m.eventId === "string")
      eventIds.add(m.eventId);
    else if (r.target && UUID.test(r.target)) eventIds.add(r.target);
    if (typeof m.device === "string") deviceIds.add(m.device);
  }
  const [{ data: events }, { data: devices }, users] = await Promise.all([
    eventIds.size
      ? db
          .from("events")
          .select("id, slug, name")
          .eq("organization_id", orgId)
          .in("id", [...eventIds])
      : { data: [] },
    deviceIds.size
      ? db
          .from("devices")
          .select("id, name")
          .eq("organization_id", orgId)
          .in("id", [...deviceIds])
      : { data: [] },
    authUsers(),
  ]);
  const ev = new Map((events ?? []).map((e) => [e.id, e]));
  const dev = new Map((devices ?? []).map((d) => [d.id, d.name]));
  const who = new Map(
    users.map((u) => [u.id, String(u.user_metadata?.name ?? (u.email ?? "").split("@")[0])]),
  );

  // Catatan yang event/booth-nya sudah tidak ada (sisa uji otomatis: event & akun uji dihapus) tidak ditampilkan.
  const shown = rows.filter((r) =>
    r.action.startsWith("release.")
      ? true // rilis booth: bukan milik event/booth tertentu
      : r.action.startsWith("device.")
        ? dev.has(r.target ?? "")
        : ev.has(
            r.action.startsWith("session.") ? String(meta(r).eventId ?? "") : (r.target ?? ""),
          ),
  );
  const groups: { day: string; items: typeof rows }[] = [];
  for (const r of shown) {
    const d = day.format(new Date(r.created_at));
    const g = groups.at(-1);
    if (g?.day === d) g.items.push(r);
    else groups.push({ day: d, items: [r] });
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Riwayat</h1>
        <p className="mt-1 text-sm text-text-2">
          Siapa mengubah apa, terbaru di atas ({LIMIT} perubahan terakhir).
        </p>
      </div>
      {groups.length === 0 && (
        <p className="rounded-2xl border-[1.5px] border-dashed border-ink bg-white px-5 py-8 text-center text-sm text-text-2">
          Belum ada perubahan yang tercatat.
        </p>
      )}
      {groups.map((g) => (
        <section
          key={g.day}
          aria-label={g.day}
          className="rounded-2xl border-[1.5px] border-ink bg-white"
        >
          <h2 className="border-b-[1.5px] border-dashed border-ink px-5 py-3 text-sm font-extrabold">
            {g.day}
          </h2>
          <ul>
            {g.items.map((r) => {
              const m = meta(r);
              const e =
                ev.get(
                  r.action.startsWith("session.") ? String(m.eventId ?? "") : (r.target ?? ""),
                ) ?? null;
              const booth = dev.get(
                String(r.action.startsWith("device.") ? r.target : (m.device ?? "")),
              );
              const actor = r.actor_user_id
                ? (who.get(r.actor_user_id) ?? "Anggota tim")
                : booth
                  ? `Booth ${booth}`
                  : "Sistem";
              return (
                <li
                  key={r.id}
                  data-testid="history-row"
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-dashed border-line-soft px-5 py-2.5 text-sm last:border-0"
                >
                  <span className="w-12 flex-none font-mono text-xs text-text-2 tabular-nums">
                    {clock.format(new Date(r.created_at))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b>{actor}</b> {auditText(r.action, m)}
                    {r.action.startsWith("device.") && booth && <> · {booth}</>}
                    {e && (
                      <>
                        {" · "}
                        <Link href={`/admin/events/${e.slug}`} className="font-bold underline">
                          {e.name}
                        </Link>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
