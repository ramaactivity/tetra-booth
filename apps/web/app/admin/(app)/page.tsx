import Link from "next/link";
import { requireMember } from "@/lib/supabase/server";
import { NewEventForm } from "./NewEventForm";

export const dynamic = "force-dynamic";

const TABS = [
  ["semua", "Semua"],
  ["mendatang", "Mendatang"],
  ["berlangsung", "Berlangsung"],
  ["selesai", "Selesai"],
] as const;
type Tab = (typeof TABS)[number][0];
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
const phase = (d: string): Exclude<Tab, "semua"> => {
  const t = today();
  return d === t ? "berlangsung" : d > t ? "mendatang" : "selesai";
};
const STATUS: Record<Exclude<Tab, "semua">, [string, string]> = {
  berlangsung: ["Berlangsung", "bg-mint-soft"],
  mendatang: ["Mendatang", "bg-lavender"],
  selesai: ["Selesai", "bg-neutral"],
};
const ICON = ["bg-peach", "bg-sky", "bg-lavender", "bg-mint-soft"];
const shortDate = (d: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`));
const daysLeft = (ts: string | null) => {
  if (!ts) return "—";
  const d = Math.ceil((new Date(ts).getTime() - Date.now()) / 86_400_000);
  return d > 0 ? `${d} hari lagi` : "Dihapus";
};

/** Daftar event (desain v2 E1). */
export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: raw } = await searchParams;
  const tab: Tab = TABS.some(([k]) => k === raw) ? (raw as Tab) : "semua";
  const { db, orgId } = await requireMember();
  const { data } = await db
    .from("events")
    .select("id, name, event_date, mode, purge_at, event_devices(devices(name)), sessions(count)")
    .eq("organization_id", orgId)
    .neq("status", "archived")
    .order("event_date", { ascending: false });
  const events = (data ?? []).filter((e) => tab === "semua" || phase(e.event_date) === tab);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Event</h1>
        <NewEventForm />
      </div>
      <nav className="flex self-start overflow-hidden rounded-xl border-[1.5px] border-ink bg-white">
        {TABS.map(([k, label], i) => (
          <Link
            key={k}
            href={k === "semua" ? "/admin" : `/admin?tab=${k}`}
            className={`flex h-[38px] items-center px-4 text-[13px] no-underline ${i ? "border-l-[1.5px] border-ink" : ""} ${k === tab ? "bg-lavender font-bold" : "font-semibold"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white">
        <div className="grid h-[46px] grid-cols-[2.2fr_1.2fr_1fr_1.4fr_.7fr_1.2fr_1fr] items-center border-b-[1.5px] border-ink bg-paper px-5 text-xs font-bold text-text-2">
          <span>Nama event</span>
          <span>Tanggal</span>
          <span>Mode</span>
          <span>Device</span>
          <span>Sesi</span>
          <span>Status</span>
          <span>Retensi</span>
        </div>
        {events.map((e, i) => {
          const [label, bg] = STATUS[phase(e.event_date)];
          return (
            <Link
              key={e.id}
              href={`/admin/events/${e.id}`}
              className="grid h-[62px] grid-cols-[2.2fr_1.2fr_1fr_1.4fr_.7fr_1.2fr_1fr] items-center border-b-[1.5px] border-dashed border-line-soft px-5 text-sm no-underline last:border-b-0 hover:bg-paper"
            >
              <span className="flex items-center gap-2.5 font-bold">
                <span
                  className={`size-8 flex-none rounded-[9px] border-[1.5px] border-dashed border-ink ${ICON[i % ICON.length]}`}
                />
                {e.name}
              </span>
              <span className="text-text-3">{shortDate(e.event_date)}</span>
              <span>
                <span
                  className={`rounded-lg border-[1.5px] border-ink px-2.5 py-1 text-xs font-bold ${e.mode === "photobox" ? "bg-lavender" : "bg-sky"}`}
                >
                  {e.mode === "photobox" ? "Photobox" : "Event"}
                </span>
              </span>
              <span className="truncate text-text-3">
                {e.event_devices.map((d) => d.devices.name).join(", ") || "—"}
              </span>
              <span className="font-mono text-[13px]">{e.sessions[0]?.count ?? 0}</span>
              <span>
                <span
                  className={`rounded-full border-[1.5px] border-ink px-2.5 py-1 text-xs font-bold whitespace-nowrap ${bg}`}
                >
                  {label}
                </span>
              </span>
              <span className="text-[13px] text-text-2">{daysLeft(e.purge_at)}</span>
            </Link>
          );
        })}
        {!events.length && <p className="px-5 py-8 text-sm text-text-2">Belum ada event.</p>}
      </div>
    </>
  );
}
