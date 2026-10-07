import {
  hhmm,
  LAYOUT_PRESETS,
  type LayoutPaper,
  outsideRun,
  type PresetId,
  paperLabel,
  parseRun,
} from "@tetra/shared";
import {
  ChevronLeft,
  CloudUpload,
  Download,
  ExternalLink,
  Images,
  Printer,
  QrCode,
  Settings,
} from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { copy } from "@/lib/copy";
import { DEFAULT_TEMPLATE, type EventTemplate } from "@/lib/event-bundle";
import { eventKey } from "@/lib/events";
import type { OpsSync } from "@/lib/ops-sync";
import { presignDownload, presignGet } from "@/lib/r2";
import type { RecapData } from "@/lib/recap";
import { requireMember } from "@/lib/supabase/server";
import { approvedDesign, OPS_PAPER_OF, opsBookingNow, opsDriftOf } from "@/lib/tetra-ops";
import { OpsDesignInstall } from "./OpsDesignInstall";
import { RecapDialog } from "./RecapDialog";
import { RunPanel } from "./RunPanel";
import { SessionTile } from "./SessionTile";
import { LinksPanel } from "./settings/LinksPanel";

export const dynamic = "force-dynamic";

const WIB = { timeZone: "Asia/Jakarta" } as const;
const hourOf = (ts: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", ...WIB }).format(
      new Date(ts),
    ),
  );
const clock = (ts: string) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", ...WIB }).format(
    new Date(ts),
  );
const UPLOAD: Record<string, string> = {
  pending: "Menunggu upload",
  partial: "Sebagian terkirim",
  complete: "Terkirim",
};
const TILES = 60;

/** Dashboard event (desain v2 E2) + moderasi sesi (E8). */
export default async function EventDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, orgId, role } = await requireMember();
  const { data: ev } = await db
    .from("events")
    .select(
      "id, slug, name, event_date, location, mode, settings, client_token, live_token, run, package_name, package_hours, scheduled_start, scheduled_end, local_bytes, local_files, created_at, ops_sync, ops_project_id",
    )
    .eq(eventKey(id), id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) notFound();
  if (id !== ev.slug) redirect(`/admin/events/${ev.slug}`);
  const [
    { data: sessions },
    { data: hits },
    { count: leadCount },
    { count: photoCount },
    { data: cloudSize },
  ] = await Promise.all([
    db
      .from("sessions")
      .select("id, started_at, print_count, upload_status, hidden_at, device_id, is_test")
      .eq("event_id", ev.id)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(5000),
    db
      .from("analytics_events")
      .select("session_id, type")
      .eq("event_id", ev.id)
      .eq("organization_id", orgId)
      .limit(50000),
    db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("event_id", ev.id)
      .eq("organization_id", orgId),
    // Foto terunggah (rekap): file original sesi event ini yang sudah tercatat di cloud.
    db
      .from("assets")
      .select("id, sessions!inner(event_id)", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("kind", "original")
      .eq("sessions.event_id", ev.id)
      .eq("sessions.is_test", false)
      .is("sessions.deleted_at", null),
    // Ukuran di cloud (rekap #166): jumlah assets.bytes sesi asli.
    db.rpc("event_cloud_storage", { org: orgId, ev: ev.id }),
  ]);
  // Desain frame event (utama dulu): nama + ukuran; template editor bisa langsung diedit.
  const tpl = (ev.settings as { template?: EventTemplate } | null)?.template ?? DEFAULT_TEMPLATE;
  const picked = [tpl.layoutId ? `tpl:${tpl.layoutId}` : tpl.preset, ...(tpl.extras ?? [])];
  const tplIds = picked.filter((d) => d.startsWith("tpl:")).map((d) => d.slice(4));
  const { data: tplRows } = tplIds.length
    ? await db
        .from("layouts")
        .select("id, name, paper")
        .eq("organization_id", orgId)
        .in("id", tplIds)
    : { data: [] };
  const designs = picked.flatMap(
    (d): { key: string; name: string; paper: string; id: string | null }[] => {
      if (!d.startsWith("tpl:")) {
        const p = LAYOUT_PRESETS[d as PresetId];
        return p ? [{ key: d, name: p.name, paper: paperLabel(p.layout.paper), id: null }] : [];
      }
      const t = (tplRows ?? []).find((r) => r.id === d.slice(4));
      return t
        ? [{ key: d, name: t.name, paper: paperLabel(t.paper as LayoutPaper), id: t.id }]
        : [];
    },
  );
  // Sesi tes crew (#153) tampil di daftar sesi dengan tanda "Tes", tapi tidak dihitung di statistik & rekap.
  const all = sessions ?? [];
  const list = all.filter((s) => !s.is_test);
  const real = new Set(list.map((s) => s.id));
  const hitIds = (f: (t: string) => boolean) =>
    new Set(
      (hits ?? [])
        .filter((h) => f(h.type) && !!h.session_id && real.has(h.session_id))
        .map((h) => h.session_id),
    );
  const opened = hitIds((t) => t === "qr_open");
  const saved = hitIds((t) => t !== "qr_open");
  const total = list.length;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
  const prints = list.reduce((a, s) => a + s.print_count, 0);
  const stats = [
    { l: "Total sesi", v: total, x: "", bg: "var(--peach)", I: Images },
    { l: "Lembar dicetak", v: prints, x: "", bg: "var(--sky)", I: Printer },
    { l: "QR dibuka", v: opened.size, x: pct(opened.size), bg: "var(--lavender)", I: QrCode },
    {
      l: "Terkirim lengkap",
      v: list.filter((s) => s.upload_status === "complete").length,
      x: "",
      bg: "var(--mint-soft)",
      I: CloudUpload,
    },
  ];
  const byHour = new Map<number, number>();
  for (const s of list)
    byHour.set(hourOf(s.started_at), (byHour.get(hourOf(s.started_at)) ?? 0) + 1);
  const hours = [...byHour.entries()].sort(([a], [b]) => a - b);
  const peak = Math.max(1, ...byHour.values());
  const funnel = [
    { l: "Sesi", n: total, c: "var(--sky)" },
    { l: "QR dibuka", n: opened.size, c: "var(--lavender)" },
    { l: "Disimpan ke HP", n: saved.size, c: "var(--mint)" },
  ];

  const recent = all.slice(0, TILES);
  const { data: thumbs } = recent.length
    ? await db
        .from("assets")
        .select("session_id, kind, r2_key")
        .eq("organization_id", orgId)
        .in("kind", ["thumb_strip", "strip_web"])
        .in(
          "session_id",
          recent.map((s) => s.id),
        )
    : { data: [] };
  const key = (k: string) => k.split("#")[0] ?? k;
  const thumbUrl = new Map(
    await Promise.all(
      (thumbs ?? [])
        .filter((t) => t.kind === "thumb_strip")
        .map(async (t) => [t.session_id, await presignGet(key(t.r2_key))] as const),
    ),
  );
  // Tombol Download per sesi: strip web resolusi penuh, langsung terunduh (attachment).
  const downloadUrl = new Map(
    await Promise.all(
      (thumbs ?? [])
        .filter((t) => t.kind === "strip_web")
        .map(
          async (t) =>
            [
              t.session_id,
              await presignDownload(key(t.r2_key), `tetra-${t.session_id}-strip.jpg`),
            ] as const,
        ),
    ),
  );
  const btn =
    "flex h-10 items-center gap-2 rounded-[11px] border-[1.5px] border-ink px-3.5 text-[13px] font-bold no-underline";

  // Rekap event (#148): booth yang memotret sesi event ini, sesi pertama/terakhir.
  const deviceIds = [...new Set(list.flatMap((s) => (s.device_id ? [s.device_id] : [])))];
  const { data: boothRows } = deviceIds.length
    ? await db.from("devices").select("id, name").eq("organization_id", orgId).in("id", deviceIds)
    : { data: [] };
  const run = parseRun(ev.run);
  const recap: RecapData = {
    name: ev.name,
    date: ev.event_date,
    venue: ev.location,
    packageName: ev.package_name,
    packageHours: ev.package_hours,
    booths: (boothRows ?? []).map((d) => d.name).sort(),
    designs: designs.map((d) => `${d.name} (${d.paper})`),
    sessions: total,
    prints,
    opened: opened.size,
    saved: saved.size,
    leads: leadCount ?? 0,
    photos: photoCount ?? 0,
    firstAt: list.at(-1)?.started_at ?? null,
    lastAt: list[0]?.started_at ?? null,
    outside: outsideRun(
      run,
      list.map((s) => s.started_at),
    ),
    run,
    scheduledStart: hhmm(ev.scheduled_start),
    scheduledEnd: hhmm(ev.scheduled_end),
    local: ev.local_bytes === null ? null : { bytes: ev.local_bytes, files: ev.local_files ?? 0 },
    cloudBytes: cloudSize?.[0]?.bytes ?? 0,
  };

  const ops = (ev.ops_sync ?? {}) as OpsSync;
  const t = copy.admin.opsSync;
  const opsNotes: { text: string; bg: string }[] = [];
  if (ops.cancelled_at) opsNotes.push({ text: t.cancelled, bg: "bg-coral" });
  if (ops.updated_at && Date.parse(ops.updated_at) > Date.parse(ev.created_at))
    opsNotes.push({ text: t.updated, bg: "bg-peach" });
  if (ops.design_approved_at) opsNotes.push({ text: t.design, bg: "bg-mint-soft" });
  const opsNow = await opsBookingNow(ev);
  const drift = opsDriftOf(ev, opsNow);
  const opsDesign = ev.mode === "event" ? approvedDesign(opsNow?.booking, ev.name) : null;
  const opsPaper = opsDesign ? OPS_PAPER_OF(opsDesign.frameSize) : undefined;
  if (drift?.kind === "missing") opsNotes.push({ text: t.missing, bg: "bg-coral" });
  if (drift?.kind === "changed") {
    const val = (f: (typeof drift.fields)[number]) =>
      f.field === "date"
        ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" }).format(
            new Date(`${f.ops}T00:00:00Z`),
          )
        : f.ops;
    const list = drift.fields.map((f) => `${t.field[f.field]} ${val(f)}`).join(", ");
    opsNotes.push({ text: `${t.changed} ${list}. ${t.fix}`, bg: "bg-peach" });
  }
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={ev.mode === "photobox" ? "/admin/photobox" : "/admin"}
            className="-ml-1 inline-flex items-center gap-0.5 text-[13px] font-semibold text-text-2 no-underline hover:text-ink"
          >
            <ChevronLeft aria-hidden className="size-4" strokeWidth={2} />
            {ev.mode === "photobox" ? "Photobox" : "Event"}
          </Link>
          <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.03em]">{ev.name}</h1>
          <p className="mt-2.5 flex items-center gap-2 text-[13px] text-text-3">
            {new Intl.DateTimeFormat("id-ID", {
              day: "numeric",
              month: "short",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${ev.event_date}T00:00:00Z`))}
            {ev.location ? ` · ${ev.location}` : ""}
            <span className="rounded-lg border-[1.5px] border-ink bg-sky px-2.5 py-0.5 text-xs font-bold">
              {ev.mode === "photobox" ? "Photobox" : "Event"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <RecapDialog data={recap} slug={ev.slug} />
          {!!leadCount && role !== "crew" && (
            <a href={`/admin/events/${ev.slug}/leads`} className={`${btn} bg-white`}>
              <Download aria-hidden className="size-4" strokeWidth={2} />
              Export Lead ({leadCount})
            </a>
          )}
          {ev.client_token && (
            <a
              href={`/g/${ev.slug}`}
              target="_blank"
              rel="noreferrer"
              className={`${btn} bg-white`}
            >
              Buka Galeri Klien
              <ExternalLink aria-hidden className="size-4 text-text-2" strokeWidth={2} />
            </a>
          )}
          {ev.live_token && (
            <a
              href={`/live/${ev.slug}`}
              target="_blank"
              rel="noreferrer"
              className={`${btn} bg-white`}
            >
              Buka Slideshow
              <ExternalLink aria-hidden className="size-4 text-text-2" strokeWidth={2} />
            </a>
          )}
          <Link href={`/admin/events/${ev.slug}/settings`} className={`${btn} bg-ink text-white`}>
            <Settings aria-hidden className="size-4" strokeWidth={2} />
            Pengaturan
          </Link>
        </div>
      </div>

      {opsDesign && opsPaper && (
        <OpsDesignInstall
          eventId={ev.id}
          paper={opsPaper}
          orient={opsDesign.orientation ?? "portrait"}
          installed={
            !!ops.design_installed_at &&
            (!opsDesign.approvedAt ||
              Date.parse(ops.design_installed_at) > Date.parse(opsDesign.approvedAt))
          }
        />
      )}
      {opsNotes.length > 0 && (
        <div className="mt-5 grid gap-2">
          {opsNotes.map((n) => (
            <p
              key={n.text}
              className={`rounded-xl border-[1.5px] border-ink px-4 py-2.5 text-[13px] font-semibold ${n.bg}`}
            >
              {n.text}
            </p>
          ))}
        </div>
      )}

      <RunPanel
        eventId={ev.id}
        run={run}
        packageHours={ev.package_hours}
        canEdit={role !== "crew"}
      />

      <section
        aria-label="Desain frame"
        className="flex flex-wrap items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-white px-5 py-4"
      >
        <span className="text-[15px] font-extrabold">Desain frame</span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {designs.map((d, i) => (
            <span
              key={d.key}
              className="flex items-center gap-2 rounded-full border-[1.5px] border-ink bg-sky py-1 pr-1.5 pl-3 text-[13px] font-bold"
            >
              {d.name}
              <span className="font-mono text-[11px] font-semibold text-text-2">{d.paper}</span>
              {i === 0 && designs.length > 1 && (
                <span className="rounded-full bg-butter px-2 text-[11px]">Utama</span>
              )}
              {d.id && role !== "crew" && (
                <Link
                  href={`/admin/templates/${d.id}`}
                  aria-label={`Edit desain ${d.name}`}
                  className="rounded-full border-[1.5px] border-ink bg-white px-2.5 py-0.5 text-[11px] no-underline hover:bg-butter"
                >
                  Edit desain
                </Link>
              )}
            </span>
          ))}
          {!designs.length && <span className="text-sm text-text-2">Belum ada desain</span>}
        </span>
        {role !== "crew" && (
          <Link href={`/admin/events/${ev.slug}/settings#template`} className={`${btn} bg-white`}>
            Ganti desain
          </Link>
        )}
      </section>

      {/* Link untuk dibagikan ke klien (galeri & slideshow) tanpa membuka Pengaturan. */}
      {role !== "crew" && (
        <section
          aria-label="Link untuk dibagikan"
          className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink bg-white px-5 py-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-[15px] font-extrabold">Link untuk dibagikan</span>
            <span className="text-xs text-text-2">
              Link foto per tamu ada di tombol Bagikan tiap sesi di bawah.
            </span>
          </div>
          <LinksPanel
            eventId={ev.id}
            origin={origin}
            slug={ev.slug}
            clientOn={!!ev.client_token}
            liveOn={!!ev.live_token}
          />
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.l}
            style={{ ["--under" as string]: s.bg }}
            className="layered rounded-2xl border-[1.5px] border-ink bg-white px-[18px] py-4 [--lb:1.5px] [--lx:5px]"
          >
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-text-2">
                <s.I aria-hidden className="size-4 flex-none" strokeWidth={2} />
                {s.l}
              </div>
              <div
                className="mt-0.5 text-[26px] font-extrabold tracking-[-0.03em]"
                data-testid={`stat-${s.l}`}
              >
                {s.v} <span className="text-[13px] font-bold text-text-3">{s.x}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.45fr_1fr]">
        <section className="flex min-h-[260px] flex-col rounded-2xl border-[1.5px] border-ink bg-white px-5 py-[18px]">
          <div className="flex justify-between">
            <span className="text-[15px] font-extrabold">Sesi per jam</span>
            {hours.length > 0 && (
              <span className="font-mono text-xs text-text-2">
                puncak {String(hours.find(([, n]) => n === peak)?.[0]).padStart(2, "0")}.00 · {peak}{" "}
                sesi
              </span>
            )}
          </div>
          <div className="flex flex-1 items-end gap-3.5 border-b-[1.5px] border-ink pt-4">
            {hours.map(([h, n]) => (
              <div key={h} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                <span className="font-mono text-[11px]">{n}</span>
                <div
                  className="w-full rounded-t-lg border-[1.5px] border-b-0 border-ink"
                  style={{
                    height: `${(n / peak) * 100}%`,
                    background: n === peak ? "var(--mint)" : "var(--sky)",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex gap-3.5 pt-2">
            {hours.map(([h]) => (
              <span key={h} className="flex-1 text-center font-mono text-[11px] text-text-2">
                {String(h).padStart(2, "0")}.00
              </span>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink bg-white px-5 py-[18px]">
          <div className="text-[15px] font-extrabold">Sesi → QR dibuka → Disimpan</div>
          {funnel.map((f) => (
            <div key={f.l} className="flex flex-col gap-[5px]">
              <div className="flex justify-between text-xs font-semibold">
                <span>{f.l}</span>
                <span className="font-mono">
                  {f.n}
                  {f.l !== "Sesi" ? ` · ${pct(f.n)}` : ""}
                </span>
              </div>
              <div className="h-3.5 overflow-hidden rounded-[7px] border-[1.5px] border-ink">
                <div
                  className="h-full border-r-[1.5px] border-ink"
                  style={{ width: total ? `${(f.n / total) * 100}%` : "0%", background: f.c }}
                />
              </div>
            </div>
          ))}
        </section>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-extrabold">
          Sesi {all.length > TILES ? `(${TILES} terbaru dari ${all.length})` : ""}
          {all.length > total && (
            <span className="ml-2 text-xs font-semibold text-text-2">
              {all.length - total} sesi tes tidak dihitung
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {recent.map((s) => (
            <SessionTile
              key={s.id}
              eventId={ev.id}
              id={s.id}
              thumb={thumbUrl.get(s.id) ?? null}
              download={downloadUrl.get(s.id) ?? null}
              time={clock(s.started_at)}
              hidden={!!s.hidden_at}
              test={s.is_test}
              status={UPLOAD[s.upload_status] ?? s.upload_status}
            />
          ))}
        </div>
        {!all.length && <p className="text-sm text-text-2">Belum ada sesi dari booth.</p>}
      </section>
    </>
  );
}
