import { Plus } from "lucide-react";
import Link from "next/link";
import { requireMember } from "@/lib/supabase/server";

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
/** Blok tanggal per baris: warna mengikuti fase, event selesai meredup. */
const DATE_BG: Record<Exclude<Tab, "semua">, string> = {
  berlangsung: "bg-mint-soft",
  mendatang: "bg-lavender",
  selesai: "bg-paper text-text-2",
};
const dateParts = (d: string) => {
  const p = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${d}T00:00:00Z`));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { day: v("day"), month: v("month"), year: v("year") };
};
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
    .select(
      "id, slug, name, event_date, mode, purge_at, all_devices, event_devices(devices(name)), sessions(count)",
    )
    .eq("organization_id", orgId)
    .neq("status", "archived")
    .order("event_date", { ascending: false });
  const events = (data ?? []).filter((e) => tab === "semua" || phase(e.event_date) === tab);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Event</h1>
        <Link
          href="/admin/events/new"
          className="pressable layered inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold no-underline [--lb:1.5px] [--lx:4px]"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2} />
          Buat Event
        </Link>
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
        <div className="grid h-[46px] grid-cols-[3fr_1fr_1.4fr_.7fr_1.2fr_1fr] items-center border-b-[1.5px] border-ink bg-paper px-5 text-xs font-bold text-text-2">
          <span>Event</span>
          <span>Mode</span>
          <span>Device</span>
          <span>Sesi</span>
          <span>Status</span>
          <span>Retensi</span>
        </div>
        {events.map((e) => {
          const ph = phase(e.event_date);
          const [label, bg] = STATUS[ph];
          const dt = dateParts(e.event_date);
          const thisYear = dt.year === today().slice(0, 4);
          return (
            <Link
              key={e.id}
              href={`/admin/events/${e.slug}`}
              className="grid h-[62px] grid-cols-[3fr_1fr_1.4fr_.7fr_1.2fr_1fr] items-center border-b-[1.5px] border-dashed border-line-soft px-5 text-sm no-underline last:border-b-0 hover:bg-paper"
            >
              <span className="flex min-w-0 items-center gap-3 font-bold">
                <time
                  dateTime={e.event_date}
                  className={`flex w-11 flex-none flex-col items-center rounded-[9px] border-[1.5px] border-ink py-1 leading-none ${DATE_BG[ph]}`}
                >
                  <span className="text-[15px] font-extrabold tracking-[-0.02em]">{dt.day}</span>
                  <span className="mt-0.5 text-[10px] font-bold uppercase">
                    {thisYear ? dt.month : `${dt.month} ${dt.year.slice(2)}`}
                  </span>
                </time>
                <span className="truncate">{e.name}</span>
              </span>
              <span>
                <span
                  className={`rounded-lg border-[1.5px] border-ink px-2.5 py-1 text-xs font-bold ${e.mode === "photobox" ? "bg-lavender" : "bg-sky"}`}
                >
                  {e.mode === "photobox" ? "Photobox" : "Event"}
                </span>
              </span>
              <span className="truncate text-text-3">
                {e.all_devices
                  ? "Semua booth"
                  : e.event_devices.map((d) => d.devices.name).join(", ") || "—"}
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
