import { EventSettingsSchema } from "@tetra/shared";
import { guestPhotosVisible } from "@/lib/events";
import { guestIdentity } from "@/lib/guest-cam";
import { presignGet } from "@/lib/r2";
import type { requireMember } from "@/lib/supabase/server";
import { ModerationGrid, RevealButton } from "./GuestCamPanel";

type Db = Awaited<ReturnType<typeof requireMember>>["db"];
const clock = (ts: string) =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(ts));

/**
 * Bagian Guest Cam di dashboard event (desain E15, #203): angka, banner "masih tertutup" + Buka foto sekarang,
 * antrean "Perlu disetujui". Tampil kalau Guest Cam aktif atau sudah ada sesi tamu.
 */
export async function GuestCamSection({
  db,
  orgId,
  ev,
  canEdit,
}: {
  db: Db;
  orgId: string;
  ev: {
    id: string;
    settings: unknown;
    run: unknown;
    event_date: string;
    guest_revealed_at: string | null;
  };
  canEdit: boolean;
}) {
  const cam = EventSettingsSchema.safeParse(ev.settings ?? {}).data?.guestCam;
  const assets = db
    .from("assets")
    .select("id, sessions!inner(event_id, source, deleted_at)", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("sessions.event_id", ev.id)
    .eq("sessions.source", "guest")
    .is("sessions.deleted_at", null);
  const [{ count: guests }, { count: photos }, { count: voices }, { data: pending }] =
    await Promise.all([
      db
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("event_id", ev.id)
        .eq("source", "guest")
        .is("deleted_at", null),
      assets.eq("kind", "original"),
      db
        .from("assets")
        .select("id, sessions!inner(event_id, source, deleted_at)", { count: "exact", head: true })
        .eq("organization_id", orgId)
        .eq("sessions.event_id", ev.id)
        .eq("sessions.source", "guest")
        .is("sessions.deleted_at", null)
        .eq("kind", "audio"),
      db
        .from("assets")
        .select(
          "id, kind, idx, r2_key, created_at, sessions!inner(event_id, source, deleted_at, group_name, leads(data))",
        )
        .eq("organization_id", orgId)
        .eq("sessions.event_id", ev.id)
        .eq("sessions.source", "guest")
        .is("sessions.deleted_at", null)
        .in("kind", ["original", "strip_web"])
        .eq("review_status", "pending")
        .order("created_at")
        .limit(120),
    ]);
  if (!cam?.enabled && !guests) return null;
  // Kuota tier (#221): tamu terhitung = sesi dengan ≥ 1 foto, satu nomor WA/IG = satu tamu.
  const max = cam?.maxGuests ?? null;
  const counted = max
    ? new Set(
        (
          (
            await db
              .from("sessions")
              .select("id, leads(data)")
              .eq("organization_id", orgId)
              .eq("event_id", ev.id)
              .eq("source", "guest")
              .gt("asset_count", 0)
              .is("deleted_at", null)
          ).data ?? []
        ).map((x) =>
          guestIdentity(x.leads[0]?.data as { whatsapp?: string; instagram?: string } | null, x.id),
        ),
      ).size
    : null;
  const items = await Promise.all(
    (pending ?? []).map(async (a) => ({
      id: a.id,
      name: a.sessions.group_name ?? "Tamu",
      wa: (a.sessions.leads[0]?.data as { whatsapp?: string } | null)?.whatsapp ?? null,
      time: clock(a.created_at),
      strip: a.kind === "strip_web",
      thumb: await presignGet(
        (a.r2_key.split("#")[0] ?? a.r2_key).replace(
          /\/(original|strip_web)_(\d+)\.jpg$/,
          (_, k, n) => `/${k === "original" ? "thumb_original" : "thumb_strip"}_${n}.jpg`,
        ),
        3600,
      ),
    })),
  );
  const closed = cam?.reveal === "after" && !guestPhotosVisible(ev);
  const stat = (label: string, n: number | null, sub: string, under: string) => (
    <div
      className={`layered flex flex-col gap-1.5 rounded-2xl border-[1.5px] border-ink bg-white px-[18px] py-4 [--lb:1.5px] [--lx:5px] ${under}`}
    >
      <span className="text-[13px] text-text-2">{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-[30px] leading-none font-extrabold tracking-[-0.03em]">
          {(n ?? 0).toLocaleString("id-ID")}
        </span>
        <span className="text-xs text-text-2">{sub}</span>
      </span>
    </div>
  );
  return (
    <section id="guest-cam" aria-labelledby="gc-title" className="flex scroll-mt-6 flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 id="gc-title" className="text-lg font-extrabold tracking-[-0.02em]">
          Guest Cam
        </h2>
        {items.length > 0 && (
          <span className="flex h-6 items-center rounded-full border-[1.5px] border-ink bg-peach px-2 font-mono text-xs">
            {items.length}
          </span>
        )}
        <span className="flex-1 border-t-[1.5px] border-dashed border-ink" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {max && counted !== null
          ? stat(
              "Kuota tamu",
              counted,
              `dari ${max.toLocaleString("id-ID")}${counted >= max * 0.8 ? " · hampir penuh" : ""}`,
              counted >= max * 0.8 ? "[--under:var(--coral)]" : "[--under:var(--peach)]",
            )
          : stat("Tamu ikut", guests, "orang", "[--under:var(--peach)]")}
        {stat(
          "Foto",
          photos,
          guests ? `${Math.round((photos ?? 0) / guests)} rata-rata/tamu` : "",
          "[--under:var(--sky)]",
        )}
        {stat("Ucapan", voices, "suara", "[--under:var(--lavender)]")}
        {stat("Perlu disetujui", items.length, "antre", "[--under:var(--mint)]")}
      </div>
      {closed && (
        <div className="layered flex flex-col gap-3 rounded-2xl border-[1.5px] border-ink bg-peach px-5 py-4 [--lb:1.5px] [--lx:5px] md:flex-row md:items-center">
          <span className="flex h-11 w-12 flex-none items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-ink bg-white font-mono text-[13px]">
            {photos && photos >= 1000 ? `${(photos / 1000).toFixed(1)}k` : (photos ?? 0)}
          </span>
          <div className="flex-1">
            <p className="font-extrabold">Foto tamu masih tertutup</p>
            <p className="text-[13px] text-text-3">
              Terbuka otomatis saat kamu menekan Hentikan Acara. Foto yang belum disetujui tetap
              tersembunyi.
            </p>
          </div>
          {canEdit && <RevealButton eventId={ev.id} />}
        </div>
      )}
      {(cam?.approval === "manual" || items.length > 0) && (
        <ModerationGrid eventId={ev.id} items={items} canEdit={canEdit} />
      )}
    </section>
  );
}
