import { BoothStatus } from "@tetra/shared";
import { Camera, CloudUpload, Printer, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { boothsOfEvent, CAMERA_KIND, PAPER_LOW, problems } from "@/lib/booth-health";
import { ymdWib } from "@/lib/events";
import { ago, isOnline } from "@/lib/format";
import { requireMember } from "@/lib/supabase/server";
import { unitLabels } from "@/lib/tetra-ops";
import { AutoRefresh } from "../devices/PairPanel";

export const dynamic = "force-dynamic";
const REFRESH_S = 15;

type Dev = {
  id: string;
  name: string;
  short_code: string | null;
  last_seen_at: string | null;
  status: unknown;
};

/**
 * Tetra Assistant (#264, terinspirasi Gabooth Assistant): satu layar HP untuk crew/operator di lapangan. Acara
 * hari ini (WIB) → unit → laptop yang sedang menjalankannya: online, masalah yang perlu ditangani (aturan sama
 * dengan halaman Device), kertas, cetak gagal, upload tertunda, kamera, sesi & lembar hari ini. Data dari heartbeat
 * booth (tiap 60 dtk) + sesi cloud; halaman menyegarkan diri tiap 15 dtk. Semua anggota (termasuk crew) bisa buka.
 */
export default async function AssistantPage() {
  const { db, orgId } = await requireMember();
  const now = Date.now();
  const today = ymdWib(now);
  const [{ data: events }, { data: devices }] = await Promise.all([
    db
      .from("events")
      .select(
        "id, slug, name, ops_project_id, ops_sync, all_devices, paper:bundle->config->layout->paper, event_devices(device_id)",
      )
      .eq("organization_id", orgId)
      .eq("event_date", today)
      .order("name"),
    db
      .from("devices")
      .select("id, name, short_code, last_seen_at, status")
      .eq("organization_id", orgId)
      .is("revoked_at", null),
  ]);
  const evs = events ?? [];
  const { data: sessions } = evs.length
    ? await db
        .from("sessions")
        .select("event_id, device_id, print_count")
        .eq("organization_id", orgId)
        .in(
          "event_id",
          evs.map((e) => e.id),
        )
        .eq("is_test", false)
        .is("deleted_at", null)
    : { data: [] };
  const stat = (eventId: string, deviceId?: string) => {
    const list = (sessions ?? []).filter(
      (s) => s.event_id === eventId && (!deviceId || s.device_id === deviceId),
    );
    return { sessions: list.length, prints: list.reduce((a, s) => a + (s.print_count ?? 0), 0) };
  };
  const statusOf = (d: Dev) => {
    const r = BoothStatus.safeParse(d.status);
    return r.success ? r.data : null;
  };
  const devs = (devices ?? []) as Dev[];
  const devsOf = (e: (typeof evs)[number]) => boothsOfEvent(e, devs);
  const shown = new Set(evs.flatMap((e) => devsOf(e).map((d) => d.id)));
  const others = devs.filter((d) => !shown.has(d.id) && isOnline(d.last_seen_at, now));
  const units = unitLabels(evs);

  return (
    <main className="mx-auto w-full max-w-[720px] px-4 pt-6 pb-16 md:px-8">
      <AutoRefresh seconds={REFRESH_S} />
      <p className="text-xs font-bold text-text-2">
        {new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeZone: "Asia/Jakarta" }).format(
          now,
        )}
      </p>
      <h1 className="mt-1 text-[28px] leading-tight font-extrabold tracking-[-0.03em]">
        Assistant
      </h1>
      <p className="mt-1 text-sm text-text-2">
        Kondisi semua booth di acara hari ini. Diperbarui sendiri tiap {REFRESH_S} detik.
      </p>

      {evs.length === 0 && (
        <p className="mt-8 rounded-2xl border-[1.5px] border-ink bg-white px-5 py-6 text-center text-sm font-semibold">
          Tidak ada acara hari ini.
        </p>
      )}

      {evs.map((e) => {
        const ds = devsOf(e);
        const total = stat(e.id);
        return (
          <section key={e.id} data-testid="assistant-event" className="mt-6">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={`/admin/events/${e.slug}`} className="min-w-0 no-underline">
                <h2 className="truncate text-lg font-extrabold">{e.name}</h2>
                <p className="text-xs font-bold text-text-2">{units.get(e.id) ?? "Booth"}</p>
              </Link>
              <p className="flex-none font-mono text-xs text-text-2">
                {total.sessions} sesi · {total.prints} lembar
              </p>
            </div>
            {ds.length === 0 ? (
              <p className="mt-2 rounded-2xl border-[1.5px] border-dashed border-ink/40 bg-paper px-4 py-3 text-sm text-text-2">
                Belum ada laptop yang membuka acara ini.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2.5">
                {ds.map((d) => (
                  <DeviceCard
                    key={d.id}
                    d={d}
                    st={statusOf(d)}
                    now={now}
                    today={stat(e.id, d.id)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-extrabold text-text-2">Laptop lain yang online</h2>
          <ul className="mt-2 flex flex-col gap-2.5">
            {others.map((d) => (
              <DeviceCard key={d.id} d={d} st={statusOf(d)} now={now} />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function DeviceCard({
  d,
  st,
  now,
  today,
}: {
  d: Dev;
  st: BoothStatus | null;
  now: number;
  today?: { sessions: number; prints: number };
}) {
  const online = isOnline(d.last_seen_at, now);
  const issues = st ? problems(st, d.last_seen_at, now, true, false) : [];
  const paper = st?.paper;
  const pct = paper ? Math.max(0, Math.min(100, (paper.remaining / paper.capacity) * 100)) : 0;
  return (
    <li
      data-testid="assistant-device"
      className={`rounded-2xl border-[1.5px] px-4 py-3.5 ${issues.length ? "border-ink bg-coral/40" : "border-ink bg-white"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className={`size-2.5 flex-none rounded-full ${online ? "bg-green" : "bg-text-3"}`}
          />
          <span className="truncate font-extrabold">
            {d.name}
            {d.short_code && (
              <span className="ml-1.5 font-mono text-xs text-text-2">{d.short_code}</span>
            )}
          </span>
        </span>
        <span className="flex-none text-xs font-bold text-text-2">
          {online ? "Online" : `Offline · ${ago(d.last_seen_at, now)}`}
        </span>
      </div>
      {issues.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1">
          {issues.map((t) => (
            <li key={t} className="flex items-start gap-1.5 text-sm font-bold">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 flex-none" strokeWidth={2.25} />
              {t}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm font-semibold text-text-2">Aman, tidak ada masalah.</p>
      )}
      {st && (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-4">
          <span className="col-span-2 sm:col-span-1">
            <span className="flex items-center gap-1.5 font-bold">
              <Printer aria-hidden className="size-3.5" /> Kertas
            </span>
            {paper ? (
              <>
                <span className="font-mono">
                  {paper.remaining}/{paper.capacity}
                </span>
                <span className="mt-1 block h-1.5 overflow-hidden rounded bg-paper">
                  <span
                    className={`block h-full ${paper.remaining <= PAPER_LOW ? "bg-coral-strong" : "bg-ink"}`}
                    style={{ width: `${pct}%` }}
                  />
                </span>
              </>
            ) : (
              <span className="text-text-2">-</span>
            )}
          </span>
          <span>
            <span className="flex items-center gap-1.5 font-bold">
              <Camera aria-hidden className="size-3.5" /> Kamera
            </span>
            {st.camera
              ? `${st.camera.model ?? CAMERA_KIND[st.camera.kind] ?? st.camera.kind}${st.camera.connected === false ? " · putus" : ""}`
              : "-"}
          </span>
          <span>
            <span className="flex items-center gap-1.5 font-bold">
              <CloudUpload aria-hidden className="size-3.5" /> Upload
            </span>
            {st.uploadPending ? `${st.uploadPending} menunggu` : "Beres"}
          </span>
          {today && (
            <span>
              <span className="font-bold">Hari ini</span>
              <span className="block font-mono">
                {today.sessions} sesi · {today.prints} lbr
              </span>
            </span>
          )}
        </div>
      )}
    </li>
  );
}
