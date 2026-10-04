import { durationText, fileSize, hhmm, parseRun, runElapsedMs, runState } from "@tetra/shared";
import {
  CalendarClock,
  CalendarDays,
  HardDrive,
  Images,
  type LucideIcon,
  Plus,
  Printer,
  Radio,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import type { PhotoboxSettings } from "@/lib/payments";
import { requireMember } from "@/lib/supabase/server";
import { EventFilters } from "./EventFilters";

const TABS = [
  ["semua", "Semua"],
  ["mendatang", "Mendatang"],
  ["berlangsung", "Berlangsung"],
  ["selesai", "Selesai"],
] as const;
type Tab = (typeof TABS)[number][0];
type Phase = Exclude<Tab, "semua">;
type Mode = "event" | "photobox";
export type ListParams = {
  tab?: string;
  q?: string;
  bulan?: string;
  booth?: string;
  urut?: string;
};

const DAY = 86_400_000;
type Stat = { l: string; v: number | string; sub?: string; I: LucideIcon; bg: string };
const ymdWib = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date(ms));
const STATUS: Record<Phase, [string, string]> = {
  berlangsung: ["Berlangsung", "bg-mint-soft"],
  mendatang: ["Mendatang", "bg-lavender"],
  selesai: ["Selesai", "bg-neutral"],
};
/** Blok tanggal per baris: warna mengikuti fase, event selesai meredup. */
const DATE_BG: Record<Phase, string> = {
  berlangsung: "bg-mint-soft",
  mendatang: "bg-lavender",
  selesai: "bg-paper text-text-2",
};
const RUN_TEXT = { running: "Berjalan", paused: "Dijeda", finished: "Selesai" } as const;
const dateParts = (d: string) => {
  const p = new Intl.DateTimeFormat("id-ID", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).formatToParts(new Date(`${d}T00:00:00Z`));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { day: v("day"), month: v("month"), year: v("year"), weekday: v("weekday") };
};
const daysLeft = (ts: string | null) => {
  if (!ts) return "—";
  const d = Math.ceil((new Date(ts).getTime() - Date.now()) / DAY);
  return d > 0 ? `${d} hari lagi` : "Dihapus";
};
const monthName = (ym: string) =>
  new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${ym}-01T00:00:00Z`),
  );
const rupiah = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;
const clock = (v: string) => v.replace(":", ".");
/** Kolom per mode: Event = jadwal, paket, durasi nyata; Photobox = harga & transaksi lunas. */
const COLS: Record<Mode, string> = {
  event:
    "lg:grid lg:grid-cols-[minmax(0,2.5fr)_minmax(0,1.4fr)_minmax(0,1.25fr)_minmax(0,1.1fr)_minmax(0,.6fr)_minmax(0,.75fr)_minmax(0,1fr)_minmax(0,.85fr)] lg:gap-4",
  photobox:
    "lg:grid lg:grid-cols-[minmax(0,2.5fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,.6fr)_minmax(0,.75fr)_minmax(0,1fr)_minmax(0,.85fr)] lg:gap-4",
};
const HEAD: Record<Mode, string[]> = {
  event: [
    "Event",
    "Jadwal & paket",
    "Durasi nyata",
    "Booth",
    "Sesi",
    "Lembar dicetak",
    "Status",
    "Retensi",
  ],
  photobox: [
    "Photobox",
    "Booth",
    "Harga",
    "Transaksi lunas",
    "Sesi",
    "Lembar dicetak",
    "Status",
    "Retensi",
  ],
};

/**
 * Daftar Event / Photobox (DECISIONS #156, sidebar Operasional): ringkasan bulan ini per mode, filter lewat URL
 * (status, cari, bulan, booth, urutan) supaya bisa dibagikan, kolom sesuai mode. Sesi tes crew (#153) tidak
 * dihitung. Pendapatan tidak ditampilkan ke crew.
 */
export async function EventsList({ mode, sp }: { mode: Mode; sp: ListParams }) {
  const tab: Tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as Tab) : "semua";
  const { db, orgId, role } = await requireMember();
  const money = role !== "crew";
  const now = Date.now();
  const today = ymdWib(now);
  const week = ymdWib(now + 7 * DAY);
  const month = today.slice(0, 7);
  const [y = 0, m = 0] = month.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const [{ data }, { data: stats }, { data: pays }, { data: period }, { data: devices }] =
    await Promise.all([
      db
        .from("events")
        .select(
          "id, slug, name, event_date, purge_at, all_devices, location, branding, settings, package_name, package_hours, scheduled_start, scheduled_end, run, local_bytes, event_devices(device_id, devices(name))",
        )
        .eq("organization_id", orgId)
        .eq("mode", mode)
        .neq("status", "archived")
        .order("event_date", { ascending: false }),
      db.rpc("event_session_stats", { org: orgId }),
      mode === "photobox" ? db.rpc("event_payment_stats", { org: orgId }) : { data: [] },
      db.rpc("org_period_stats", { org: orgId, d_from: `${month}-01`, d_to: nextMonth }),
      db.from("devices").select("id, name").eq("organization_id", orgId).order("name"),
    ]);
  const count = new Map((stats ?? []).map((s) => [s.event_id, s]));
  const paid = new Map((pays ?? []).map((p) => [p.event_id, p]));
  const pm = (period ?? []).find((p) => p.mode === mode);

  const rows = (data ?? []).map((e) => {
    const run = parseRun(e.run);
    const rs = runState(run);
    // Timer yang sedang jalan/dijeda = berlangsung walau tanggalnya lewat (event lewat tengah malam).
    const phase: Phase =
      rs === "running" || rs === "paused" || e.event_date === today
        ? "berlangsung"
        : e.event_date > today
          ? "mendatang"
          : "selesai";
    const prices = (
      (e.settings as { photobox?: PhotoboxSettings } | null)?.photobox?.layouts ?? []
    ).map((l) => l.price);
    const lo = Math.min(...prices);
    const hi = Math.max(...prices);
    return {
      ...e,
      phase,
      client: (e.branding as { clientName?: string } | null)?.clientName ?? "",
      runState: rs,
      elapsed: rs === "idle" ? 0 : runElapsedMs(run, now),
      sessions: count.get(e.id)?.sessions ?? 0,
      prints: count.get(e.id)?.prints ?? 0,
      paid: paid.get(e.id)?.paid ?? 0,
      revenue: paid.get(e.id)?.revenue ?? 0,
      price: prices.length
        ? lo === hi
          ? rupiah(lo)
          : `${rupiah(lo)}–${hi.toLocaleString("id-ID")}`
        : "—",
      start: hhmm(e.scheduled_start),
      end: hhmm(e.scheduled_end),
      booths: e.all_devices
        ? "Semua booth"
        : e.event_devices.map((d) => d.devices.name).join(", ") || "—",
    };
  });

  const q = (sp.q ?? "").trim().toLowerCase();
  const bulan = /^\d{4}-\d{2}$/.test(sp.bulan ?? "") ? (sp.bulan as string) : "";
  const booth = (devices ?? []).some((d) => d.id === sp.booth) ? (sp.booth as string) : "";
  const urut = sp.urut === "terdekat" ? "terdekat" : "terbaru";
  const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
  const t0 = dayMs(today);
  const events = rows
    .filter(
      (e) =>
        (tab === "semua" || e.phase === tab) &&
        (!bulan || e.event_date.startsWith(bulan)) &&
        (!booth || e.all_devices || e.event_devices.some((d) => d.device_id === booth)) &&
        (!q || `${e.name} ${e.location ?? ""} ${e.client}`.toLowerCase().includes(q)),
    )
    .sort((a, b) =>
      urut === "terdekat"
        ? Math.abs(dayMs(a.event_date) - t0) - Math.abs(dayMs(b.event_date) - t0)
        : 0,
    );
  const filtered = !!(q || bulan || booth || tab !== "semua");
  const noun = mode === "event" ? "event" : "photobox";
  // Rata-rata ukuran folder event di laptop (#166): event dengan ukuran terlapor, di daftar yang difilter (tanpa
  // filter = bulan ini).
  const sized = (filtered ? events : rows.filter((e) => e.event_date.startsWith(month))).flatMap(
    (e) => (e.local_bytes === null ? [] : [e.local_bytes]),
  );
  const avgSize: Stat = {
    l: "Rata-rata ukuran per event",
    v: sized.length ? fileSize(sized.reduce((x, y) => x + y, 0) / sized.length) : "—",
    sub: sized.length
      ? `laptop · ${sized.length} ${noun}${filtered ? " cocok" : ""}`
      : "belum dilaporkan booth",
    I: HardDrive,
    bg: "var(--sky)",
  };
  const live = rows.filter((e) => e.phase === "berlangsung").length;
  const soon = rows.filter((e) => e.event_date > today && e.event_date <= week).length;
  const summary: Stat[] =
    mode === "event"
      ? [
          {
            l: "Event bulan ini",
            v: rows.filter((e) => e.event_date.startsWith(month)).length,
            sub: `${soon} dalam 7 hari`,
            I: CalendarDays,
            bg: "var(--lavender)",
          },
          { l: "Berlangsung sekarang", v: live, I: Radio, bg: "var(--mint-soft)" },
          { l: "Sesi bulan ini", v: pm?.sessions ?? 0, I: Images, bg: "var(--peach)" },
          {
            l: "Dicetak bulan ini",
            v: pm?.prints ?? 0,
            sub: "lembar",
            I: Printer,
            bg: "var(--butter)",
          },
          avgSize,
        ]
      : [
          { l: "Berlangsung sekarang", v: live, I: Radio, bg: "var(--mint-soft)" },
          {
            l: "Sesi bulan ini",
            v: pm?.sessions ?? 0,
            sub: `${pm?.active_days ? Math.round(pm.sessions / pm.active_days) : 0}/hari · ${pm?.active_days ?? 0} hari aktif`,
            I: Images,
            bg: "var(--peach)",
          },
          {
            l: "Dicetak bulan ini",
            v: pm?.prints ?? 0,
            sub: "lembar",
            I: Printer,
            bg: "var(--butter)",
          },
          {
            l: "Transaksi lunas bulan ini",
            v: pm?.paid ?? 0,
            ...(money && { sub: rupiah(pm?.revenue ?? 0) }),
            I: ReceiptText,
            bg: "var(--lavender)",
          },
          avgSize,
        ];
  const months = [...new Set(rows.map((e) => e.event_date.slice(0, 7)))].sort().reverse();
  const base = mode === "event" ? "/admin" : "/admin/photobox";
  const withTab = (k: string) => {
    const p = new URLSearchParams(
      Object.entries(sp).filter((x): x is [string, string] => typeof x[1] === "string"),
    );
    if (k === "semua") p.delete("tab");
    else p.set("tab", k);
    const s = p.toString();
    return s ? `${base}?${s}` : base;
  };
  const cols = COLS[mode];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">
          {mode === "event" ? "Event" : "Photobox"}
        </h1>
        <Link
          href={mode === "event" ? "/admin/events/new" : "/admin/events/new?mode=photobox"}
          className="pressable layered inline-flex h-11 items-center gap-2 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold no-underline [--lb:1.5px] [--lx:4px]"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2} />
          {mode === "event" ? "Buat Event" : "Buat Photobox"}
        </Link>
      </div>

      <section
        aria-label={`Ringkasan ${monthName(month)}`}
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5"
      >
        {summary.map((s) => (
          <div
            key={s.l}
            style={{ ["--under" as string]: s.bg }}
            className="layered rounded-2xl border-[1.5px] border-ink bg-white px-4 py-3.5 [--lb:1.5px] [--lx:4px]"
          >
            <div className="flex items-center gap-1.5 text-xs font-semibold text-text-2">
              <s.I aria-hidden className="size-4 flex-none" strokeWidth={2} />
              {s.l}
            </div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span
                data-testid={`list-stat-${s.l}`}
                className="text-[24px] font-extrabold tracking-[-0.03em]"
              >
                {typeof s.v === "number" ? s.v.toLocaleString("id-ID") : s.v}
              </span>
              {s.sub && <span className="truncate text-xs font-semibold text-text-2">{s.sub}</span>}
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav
            aria-label="Status"
            className="flex w-full overflow-hidden rounded-xl border-[1.5px] border-ink bg-white sm:w-auto"
          >
            {TABS.map(([k, label], i) => (
              <Link
                key={k}
                href={withTab(k)}
                aria-current={k === tab ? "page" : undefined}
                className={`flex h-[38px] flex-1 items-center justify-center px-2 text-[13px] no-underline sm:flex-none sm:px-4 ${i ? "border-l-[1.5px] border-ink" : ""} ${k === tab ? "bg-lavender font-bold" : "font-semibold"}`}
              >
                {label}
              </Link>
            ))}
          </nav>
          <p data-testid="list-count" className="text-[13px] font-semibold text-text-2">
            {events.length} {noun}
            {filtered ? " cocok" : ""}
          </p>
        </div>
        <EventFilters
          base={base}
          q={sp.q ?? ""}
          bulan={bulan}
          booth={booth}
          urut={urut}
          tab={tab === "semua" ? "" : tab}
          months={months.map((m) => ({ value: m, label: monthName(m) }))}
          devices={(devices ?? []).map((d) => ({ value: d.id, label: d.name }))}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white">
        <div
          className={`hidden h-[44px] items-center border-b-[1.5px] border-ink bg-paper px-5 text-xs font-bold text-text-2 ${cols}`}
        >
          {HEAD[mode].map((h) => (
            <span key={h} className="leading-tight">
              {h}
            </span>
          ))}
        </div>
        {events.map((e) => {
          const [label, bg] = STATUS[e.phase];
          const dt = dateParts(e.event_date);
          const thisYear = dt.year === today.slice(0, 4);
          const sub = [e.location, e.client].filter(Boolean).join(" · ");
          const booths = (
            <span className="block min-w-0 truncate text-[13px] text-text-3">{e.booths}</span>
          );
          return (
            <Link
              key={e.id}
              href={`/admin/events/${e.slug}`}
              data-testid="event-row"
              className={`flex flex-wrap items-center gap-x-5 gap-y-2 border-b-[1.5px] border-dashed border-line-soft px-5 py-3.5 text-sm no-underline last:border-b-0 hover:bg-paper ${cols}`}
            >
              <span className="flex w-full min-w-0 items-center gap-3 lg:w-auto">
                <time
                  dateTime={e.event_date}
                  className={`flex w-12 flex-none flex-col items-center rounded-[10px] border-[1.5px] border-ink py-1 leading-none ${DATE_BG[e.phase]}`}
                >
                  <span className="text-[10px] font-bold">{dt.weekday}</span>
                  <span className="mt-0.5 text-[16px] font-extrabold tracking-[-0.02em]">
                    {dt.day}
                  </span>
                  <span className="mt-0.5 text-[10px] font-bold uppercase">
                    {thisYear ? dt.month : `${dt.month} ${dt.year.slice(2)}`}
                  </span>
                </time>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{e.name}</span>
                  <span className="block truncate text-xs text-text-2">
                    {sub || "Lokasi belum diisi"}
                  </span>
                </span>
              </span>
              {mode === "event" ? (
                <>
                  <span className="min-w-0">
                    <span className="block font-mono text-[13px]">
                      {e.start ? `${clock(e.start)}${e.end ? `–${clock(e.end)}` : ""}` : "—"}
                    </span>
                    <span className="block truncate text-xs text-text-2">
                      {[e.package_name, e.package_hours && durationText(e.package_hours * 60)]
                        .filter(Boolean)
                        .join(" · ") || "Paket belum diisi"}
                    </span>
                  </span>
                  <span className="min-w-0" data-testid="event-row-run">
                    {e.runState === "idle" ? (
                      <span className="text-[13px] text-text-2">Belum mulai</span>
                    ) : (
                      <>
                        <span className="block text-[13px] font-semibold">
                          {durationText(e.elapsed / 60_000)}
                        </span>
                        <span className="block text-xs text-text-2">{RUN_TEXT[e.runState]}</span>
                      </>
                    )}
                  </span>
                  {booths}
                </>
              ) : (
                <>
                  {booths}
                  <span className="min-w-0 text-[13px] font-semibold">{e.price}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold">
                      <span className="font-mono">{e.paid}</span> lunas
                    </span>
                    {money && (
                      <span className="block truncate text-xs text-text-2">
                        {rupiah(e.revenue)}
                      </span>
                    )}
                  </span>
                </>
              )}
              <span className="font-mono text-[13px]" data-testid="event-row-sessions">
                {e.sessions}
                <span className="font-sans text-xs text-text-2 lg:hidden"> sesi</span>
              </span>
              <span className="font-mono text-[13px]" data-testid="event-row-prints">
                {e.prints}
                <span className="font-sans text-xs text-text-2 lg:hidden"> lembar</span>
              </span>
              <span>
                <span
                  className={`rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${bg}`}
                >
                  {label}
                </span>
              </span>
              <span className="text-[13px] text-text-2">{daysLeft(e.purge_at)}</span>
            </Link>
          );
        })}
        {!events.length && (
          <p className="px-5 py-8 text-sm text-text-2">
            {filtered ? `Tidak ada ${noun} yang cocok dengan filter ini.` : `Belum ada ${noun}.`}
          </p>
        )}
      </div>
    </>
  );
}
