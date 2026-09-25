import Link from "next/link";
import { notFound } from "next/navigation";
import { presignGet } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";
import { SessionTile } from "./SessionTile";

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
    .select("id, name, event_date, location, mode, client_token, live_token")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!ev) notFound();
  const [{ data: sessions }, { data: hits }, { count: leadCount }] = await Promise.all([
    db
      .from("sessions")
      .select("id, started_at, print_count, upload_status, hidden_at")
      .eq("event_id", id)
      .eq("organization_id", orgId)
      .is("deleted_at", null)
      .order("started_at", { ascending: false })
      .limit(5000),
    db
      .from("analytics_events")
      .select("session_id, type")
      .eq("event_id", id)
      .eq("organization_id", orgId)
      .limit(50000),
    db
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id)
      .eq("organization_id", orgId),
  ]);
  const list = sessions ?? [];
  const opened = new Set((hits ?? []).filter((h) => h.type === "qr_open").map((h) => h.session_id));
  const saved = new Set((hits ?? []).filter((h) => h.type !== "qr_open").map((h) => h.session_id));
  const total = list.length;
  const pct = (n: number) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
  const stats = [
    { l: "Total sesi", v: total, x: "", bg: "var(--peach)", i: "◷" },
    {
      l: "Lembar dicetak",
      v: list.reduce((a, s) => a + s.print_count, 0),
      x: "",
      bg: "var(--sky)",
      i: "▤",
    },
    { l: "QR dibuka", v: opened.size, x: pct(opened.size), bg: "var(--lavender)", i: "▦" },
    {
      l: "Terkirim lengkap",
      v: list.filter((s) => s.upload_status === "complete").length,
      x: "",
      bg: "var(--mint-soft)",
      i: "⇪",
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

  const recent = list.slice(0, TILES);
  const { data: thumbs } = recent.length
    ? await db
        .from("assets")
        .select("session_id, r2_key")
        .eq("organization_id", orgId)
        .eq("kind", "thumb_strip")
        .in(
          "session_id",
          recent.map((s) => s.id),
        )
    : { data: [] };
  const thumbUrl = new Map(
    await Promise.all(
      (thumbs ?? []).map(
        async (t) => [t.session_id, await presignGet(t.r2_key.split("#")[0] ?? t.r2_key)] as const,
      ),
    ),
  );
  const btn =
    "flex h-10 items-center rounded-[11px] border-[1.5px] border-ink px-3.5 text-[13px] font-bold no-underline";

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin" className="text-[13px] font-semibold text-text-2 no-underline">
            Event ›
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
        <div className="flex gap-2">
          {!!leadCount && role !== "crew" && (
            <a href={`/admin/events/${ev.id}/leads`} className={`${btn} bg-white`}>
              Export Lead ({leadCount})
            </a>
          )}
          {ev.client_token && (
            <a
              href={`/g/${ev.client_token}`}
              target="_blank"
              rel="noreferrer"
              className={`${btn} bg-white`}
            >
              Buka Galeri Klien
            </a>
          )}
          {ev.live_token && (
            <a
              href={`/live/${ev.live_token}`}
              target="_blank"
              rel="noreferrer"
              className={`${btn} bg-white`}
            >
              Buka Slideshow
            </a>
          )}
          <Link href={`/admin/events/${ev.id}/settings`} className={`${btn} bg-ink text-white`}>
            Pengaturan
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.l}
            style={{ ["--under" as string]: s.bg }}
            className="layered flex items-center gap-3.5 rounded-2xl border-[1.5px] border-ink bg-white px-[18px] py-4 [--lb:1.5px] [--lx:5px]"
          >
            <span
              className="flex size-11 flex-none items-center justify-center rounded-xl border-[1.5px] border-dashed border-ink text-[17px]"
              style={{ background: s.bg }}
            >
              {s.i}
            </span>
            <div>
              <div className="text-xs font-semibold text-text-2">{s.l}</div>
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
          Sesi {total > TILES ? `(${TILES} terbaru dari ${total})` : ""}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 2xl:grid-cols-8">
          {recent.map((s) => (
            <SessionTile
              key={s.id}
              eventId={ev.id}
              id={s.id}
              thumb={thumbUrl.get(s.id) ?? null}
              time={clock(s.started_at)}
              hidden={!!s.hidden_at}
              status={UPLOAD[s.upload_status] ?? s.upload_status}
            />
          ))}
        </div>
        {!total && <p className="text-sm text-text-2">Belum ada sesi dari booth.</p>}
      </section>
    </>
  );
}
