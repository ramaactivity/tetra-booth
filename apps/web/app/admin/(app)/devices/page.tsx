import { BoothStatus, newerVersion } from "@tetra/shared";
import { Laptop, TriangleAlert } from "lucide-react";
import { copy } from "@/lib/copy";
import { ago, isOnline } from "@/lib/format";
import { latestBoothRelease } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";
import { AddDevice, AutoRefresh, DeviceActions } from "./PairPanel";

export const dynamic = "force-dynamic";

const PAPER_LOW = 30;
const DISK_LOW_GB = 5;
const REFRESH_S = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OFFLINE_ALERT_MS = 12 * 3600_000;

const PRINTER_TEXT: Record<string, string> = {
  ready: "Siap",
  error: "Error",
  unavailable: "Tidak terhubung",
};
const CAMERA_KIND: Record<string, string> = {
  webcam: "Webcam",
  simulated: "Simulasi",
  hotfolder: "Hot folder",
  canon: "Canon",
  sony: "Sony",
};

/** Status perangkat: `detail` (model/nama) teks biasa, `text` di pill berwarna + teks. */
type Pill = { detail?: string | null | undefined; text: string; tone: "ok" | "bad" | "off" };
const TONE = { ok: "bg-mint-soft", bad: "bg-coral", off: "bg-neutral" } as const;

/** Masalah yang perlu ditangani crew (teks, bukan warna saja); dipakai juga untuk urutan kartu. */
function problems(
  st: BoothStatus,
  lastSeen: string | null,
  now: number,
  paired: boolean,
  outdated: boolean,
) {
  const p: string[] = [];
  if (!paired) return p;
  // Offline: snapshot terakhir sudah basi. Hanya ditandai kalau baru hilang (< 12 jam, kemungkinan saat event),
  // booth yang lama disimpan tidak ikut naik ke atas.
  if (!isOnline(lastSeen, now))
    return lastSeen && now - Date.parse(lastSeen) < OFFLINE_ALERT_MS ? ["Booth offline"] : p;
  if (st.camera?.connected === false) p.push("Kamera tidak terhubung");
  if (st.printer && st.printer.status !== "ready" && st.printer.status !== "unknown")
    p.push(`Printer ${PRINTER_TEXT[st.printer.status]?.toLowerCase() ?? st.printer.status}`);
  if (st.paper && st.paper.remaining <= PAPER_LOW)
    p.push(`Kertas tinggal ${st.paper.remaining} lembar`);
  if (st.failedPrints) p.push(`${st.failedPrints} cetak gagal`);
  if (st.uploadPending && st.lastError) p.push(`Upload tersendat: ${st.lastError}`);
  if (st.diskFreeGb !== undefined && st.diskFreeGb < DISK_LOW_GB)
    p.push(`Disk tinggal ${st.diskFreeGb} GB`);
  if (outdated) p.push("Versi aplikasi lama");
  return p;
}

/** Device (desain v2 E5): pantauan kondisi tiap booth dari heartbeat (tiap 60 dtk), tambah booth & sambungkan laptop booth. */
export default async function DevicesPage() {
  const { db, orgId, role } = await requireMember();
  const canManage = role !== "crew";
  const t = copy.admin.devices;
  const [{ data: devices }, latest] = await Promise.all([
    db
      .from("devices")
      .select("id, name, short_code, app_version, last_seen_at, status, token_hash")
      .eq("organization_id", orgId)
      .is("revoked_at", null),
    latestBoothRelease().catch(() => null),
  ]);
  const now = Date.now();
  const rows = (devices ?? []).map((d) => {
    const st = BoothStatus.catch({}).parse(d.status);
    const online = isOnline(d.last_seen_at, now);
    const paired = !!d.token_hash;
    const outdated =
      latest && d.app_version && /^\d+\.\d+\.\d+$/.test(d.app_version)
        ? newerVersion(latest.version, d.app_version)
        : false;
    return {
      d,
      st,
      online,
      paired,
      outdated,
      issues: problems(st, d.last_seen_at, now, paired, outdated),
    };
  });
  // Bermasalah dulu (terbanyak di atas), lalu kode booth.
  rows.sort(
    (a, b) =>
      b.issues.length - a.issues.length || a.d.short_code.localeCompare(b.d.short_code, "id"),
  );

  const ids = [
    ...new Set(rows.map((r) => r.st.activeEvent).filter((x): x is string => !!x && x !== "local")),
  ];
  const { data: events } = ids.length
    ? await db.from("events").select("id, name").eq("organization_id", orgId).in("id", ids)
    : { data: [] };
  const eventName = (st: BoothStatus) =>
    events?.find((e) => e.id === st.activeEvent)?.name ??
    st.activeEventName ??
    (!st.activeEvent || st.activeEvent === "local"
      ? "Belum dipilih"
      : UUID.test(st.activeEvent)
        ? "Event tidak ditemukan"
        : st.activeEvent);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Device</h1>
          <p className="mt-1 text-[13px] text-text-2">
            Diperbarui otomatis tiap {REFRESH_S} dtk
            {latest ? ` · rilis terbaru v${latest.version}` : ""}
          </p>
        </div>
        {canManage && <AddDevice />}
      </div>
      <AutoRefresh seconds={REFRESH_S} />
      {rows.length === 0 && (
        <section
          data-testid="devices-empty"
          className="flex flex-col gap-5 rounded-[18px] border-[1.5px] border-dashed border-ink bg-white px-6 py-6"
        >
          <div>
            <h2 className="text-xl font-extrabold tracking-[-0.02em]">{t.emptyTitle}</h2>
            <p className="mt-1 text-sm text-text-2">{t.emptyBody}</p>
          </div>
          <ol className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {t.emptySteps.map(([title, body], i) => (
              <li
                key={title}
                className="flex gap-3 rounded-[14px] border-[1.5px] border-ink bg-paper px-4 py-3.5"
              >
                <span className="flex size-8 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-butter text-sm font-extrabold">
                  {i + 1}
                </span>
                <div>
                  <h3 className="text-sm font-extrabold">{title}</h3>
                  <p className="mt-1 text-[13px] leading-normal text-text-3">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ d, st, online, paired, outdated, issues }) => {
          const under = issues.length
            ? "var(--coral)"
            : online
              ? "var(--mint-soft)"
              : "var(--neutral)";
          const cam = st.camera;
          const camera: Pill = !cam
            ? { text: "—", tone: "off" }
            : cam.connected === null
              ? { text: cam.model ?? CAMERA_KIND[cam.kind] ?? cam.kind, tone: "off" }
              : {
                  detail: cam.model ?? CAMERA_KIND[cam.kind],
                  text: cam.connected ? "Terhubung" : "Tidak terhubung",
                  tone: cam.connected ? "ok" : "bad",
                };
          const pr = st.printer;
          const printer: Pill =
            !pr || pr.status === "unknown"
              ? { text: pr?.name ?? "—", tone: "off" }
              : {
                  detail: pr.name,
                  text: PRINTER_TEXT[pr.status] ?? pr.status,
                  tone: pr.status === "ready" ? "ok" : "bad",
                };
          const paperLow = !!st.paper && st.paper.remaining <= PAPER_LOW;
          return (
            <article
              key={d.id}
              data-testid="device-card"
              style={{ ["--under" as string]: under }}
              className="layered flex flex-col overflow-hidden rounded-[18px] border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px]"
            >
              <div className="flex items-start justify-between gap-2.5 px-[18px] py-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex size-[42px] flex-none items-center justify-center rounded-[11px] border-[1.5px] border-ink"
                    style={{ background: under }}
                  >
                    <Laptop aria-hidden className="size-5" strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-extrabold">
                      {d.name}{" "}
                      <span className="font-mono text-xs font-normal text-text-2">
                        {d.short_code}
                      </span>
                    </div>
                    <div className="mt-[3px] font-mono text-[11px] text-text-2">
                      {d.app_version ? `v${d.app_version}` : "versi belum diketahui"}
                      {outdated ? " (lama)" : ""}
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink px-[9px] py-[3px] text-[11px] font-bold whitespace-nowrap ${online ? "bg-mint-soft" : issues.length ? "bg-coral" : "bg-neutral"}`}
                >
                  {online && <span aria-hidden className="size-1.5 rounded-full bg-ink" />}
                  {online
                    ? "Online"
                    : paired
                      ? `Offline · ${ago(d.last_seen_at, now)}`
                      : t.notConnected}
                </span>
              </div>
              <div className="mx-[18px] rounded-[11px] border-[1.5px] border-dashed border-ink px-3 py-[9px] text-[13px]">
                <span className="text-text-2">Event · </span>
                <b>{eventName(st)}</b>
              </div>
              <dl className="flex flex-col px-[18px] py-3 text-[13px]">
                {(
                  [
                    ["Kamera", camera],
                    ["Printer", printer],
                    [
                      "Kertas",
                      st.paper
                        ? `${st.paper.remaining} / ${st.paper.capacity}${paperLow ? " · menipis" : ""}`
                        : "—",
                    ],
                    ["Cetak gagal", st.failedPrints === undefined ? "—" : String(st.failedPrints)],
                    [
                      "Upload tertunda",
                      st.uploadPending === undefined ? "—" : `${st.uploadPending} file`,
                    ],
                    ["Disk kosong", st.diskFreeGb === undefined ? "—" : `${st.diskFreeGb} GB`],
                    ["Terakhir terlihat", ago(d.last_seen_at, now)],
                  ] as [string, string | Pill][]
                ).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between gap-3 border-b border-dashed border-line-soft py-1.5 last:border-0"
                  >
                    <dt className="flex-none text-text-2">{k}</dt>
                    <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right font-semibold">
                      {typeof v === "string" ? (
                        v
                      ) : v.tone === "off" ? (
                        v.text
                      ) : (
                        <>
                          {v.detail && <span className="min-w-0 break-words">{v.detail}</span>}
                          <span
                            className={`rounded-full border-[1.5px] border-ink px-2 py-px text-xs font-bold whitespace-nowrap ${TONE[v.tone]}`}
                          >
                            {v.text}
                          </span>
                        </>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
              {issues.length > 0 && (
                <ul
                  data-testid="device-issues"
                  className="mx-[18px] mb-3 flex flex-col gap-1 rounded-[11px] border-[1.5px] border-ink bg-peach px-3 py-[9px] text-xs font-bold"
                >
                  {issues.map((t) => (
                    <li key={t} className="flex items-start gap-1.5 break-words">
                      <TriangleAlert
                        aria-hidden
                        className="mt-px size-3.5 flex-none"
                        strokeWidth={2}
                      />
                      {t}
                    </li>
                  ))}
                </ul>
              )}
              {canManage && <DeviceActions id={d.id} name={d.name} paired={paired} />}
            </article>
          );
        })}
      </div>
    </>
  );
}
