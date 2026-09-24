import { ago, isOnline } from "@/lib/format";
import { requireMember } from "@/lib/supabase/server";
import { AddDevice, DeviceActions } from "./PairPanel";

export const dynamic = "force-dynamic";

type Status = {
  activeEvent?: string;
  paper?: { remaining?: number };
  printer?: string;
  camera?: unknown;
  uploadPending?: number;
};
const PAPER_LOW = 30;
const printerText = (p?: string) =>
  p === "ready" ? "Siap" : p === "unknown" || !p ? "—" : "Bermasalah";

/** Device (desain v2 E5): status tiap booth dari heartbeat, daftarkan & kode pairing. */
export default async function DevicesPage() {
  const { db, orgId } = await requireMember();
  const { data: devices } = await db
    .from("devices")
    .select("id, name, short_code, app_version, last_seen_at, status, token_hash")
    .eq("organization_id", orgId)
    .is("revoked_at", null)
    .order("short_code");
  const ids = [
    ...new Set(
      (devices ?? [])
        .map((d) => (d.status as Status).activeEvent)
        .filter((x): x is string => !!x && x !== "local"),
    ),
  ];
  const { data: events } = ids.length
    ? await db.from("events").select("id, name").eq("organization_id", orgId).in("id", ids)
    : { data: [] };
  const eventName = (id?: string) =>
    !id || id === "local"
      ? "Event lokal"
      : (events?.find((e) => e.id === id)?.name ?? "Event lain");
  const now = Date.now();

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">Device</h1>
        <AddDevice />
      </div>
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2 xl:grid-cols-3">
        {(devices ?? []).map((d) => {
          const st = (d.status ?? {}) as Status;
          const online = isOnline(d.last_seen_at, now);
          const paired = !!d.token_hash;
          const under = online ? "var(--mint-soft)" : "var(--neutral)";
          const paper = st.paper?.remaining;
          return (
            <article
              key={d.id}
              data-testid="device-card"
              style={{ ["--under" as string]: under }}
              className="layered flex flex-col overflow-hidden rounded-[18px] border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:5px]"
            >
              <div className="flex items-start justify-between gap-2.5 px-[18px] py-4">
                <div className="flex items-center gap-3">
                  <span
                    className="flex size-[42px] flex-none items-center justify-center rounded-[11px] border-[1.5px] border-dashed border-ink"
                    style={{ background: under }}
                  >
                    ▭
                  </span>
                  <div>
                    <div className="text-[15px] font-extrabold">
                      {d.name}{" "}
                      <span className="font-mono text-xs font-normal text-text-2">
                        {d.short_code}
                      </span>
                    </div>
                    <div className="mt-[3px] font-mono text-[11px] text-text-2">
                      {d.app_version ? `v${d.app_version} · ` : ""}
                      {ago(d.last_seen_at, now)}
                    </div>
                  </div>
                </div>
                <span
                  className={`rounded-full border-[1.5px] border-ink px-[9px] py-[3px] text-[11px] font-bold whitespace-nowrap ${online ? "bg-mint-soft" : "bg-neutral"}`}
                >
                  {online ? "● Online" : paired ? "Offline" : "Belum dipasangkan"}
                </span>
              </div>
              <div className="mx-[18px] rounded-[11px] border-[1.5px] border-dashed border-ink px-3 py-[9px] text-[13px]">
                <span className="text-text-2">Event · </span>
                <b>{eventName(st.activeEvent)}</b>
              </div>
              <dl className="flex flex-col px-[18px] py-3 text-[13px]">
                {[
                  ["Kamera", st.camera ? "OK" : "—"],
                  ["Printer", printerText(st.printer)],
                  ["Sisa kertas", paper !== undefined ? `${paper} lembar` : "—"],
                  [
                    "Antrean upload",
                    st.uploadPending !== undefined ? `${st.uploadPending} file` : "—",
                  ],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1.5">
                    <dt className="text-text-2">{k}</dt>
                    <dd className="font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              {paper !== undefined && paper <= PAPER_LOW && (
                <p className="mx-[18px] mb-3 rounded-[11px] border-[1.5px] border-ink bg-peach px-3 py-[9px] text-xs font-bold">
                  ! Kertas tinggal {paper} lembar
                </p>
              )}
              <DeviceActions id={d.id} name={d.name} />
            </article>
          );
        })}
      </div>
    </>
  );
}
