import "server-only";
import { SESSION_ID_PATTERN } from "@tetra/shared";
import { guestPhotosVisible } from "@/lib/events";
import { presignDownload, presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Galeri klien `/g/{token}` dan galeri publik tamu `/s/{id}/galeri` (FSD §3, DECISIONS #72): data event + foto yang
 * tidak disembunyikan/dihapus, termasuk GIF animasi sesi.
 */
export type GalleryPhoto = {
  id: string;
  /** `audio` = ucapan suara Guest Cam (#197). */
  kind: "strip" | "original" | "animation" | "audio";
  sessionId: string;
  hour: number;
  /** Photo Stage (#180): foto fotografer pelaminan, dikelompokkan per rombongan; guest = Guest Cam (#197). */
  source: "booth" | "stage" | "guest";
  /** Nama rombongan (stage): nama grup, atau "Tamu · 19.42"; Guest Cam: nama tamu. */
  group: string | null;
  /** Jam mulai sesi "19.42" (WIB). */
  time: string;
  thumb: string;
  full: string;
  /** URL unduh langsung (attachment). */
  download: string;
  favorite: boolean;
};
export type Gallery =
  | { state: "gone" }
  | {
      state: "ok";
      eventId: string;
      name: string;
      tagline: string | null;
      date: string;
      location: string | null;
      expiresAt: string | null;
      daysTotal: number | null;
      publicGallery: boolean;
      photos: GalleryPhoto[];
    };

const hourWib = (ts: string) =>
  Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: "Asia/Jakarta",
    }).format(new Date(ts)),
  );
const key = (k: string) => k.split("#")[0] ?? k;
const clockWib = (ts: string) =>
  new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date(ts));

/**
 * Link publik galeri/live (DECISIONS #147): `/g/<slug-event>` atau token acak lama. Link aktif = kolom token terisi
 * ("Cabut" mengosongkannya, jadi slug & token lama ikut mati). Nilai sudah lolos `LINK`, aman untuk filter `or`.
 */
export const LINK = /^[\w-]{1,80}$/;
export const byLink = (col: "client_token" | "live_token", v: string) =>
  `${col}.eq.${v},slug.eq.${v}`;

/** Event dari link klien (slug atau token); kedaluwarsa/purge/link dicabut → gone. */
export async function eventByClientToken(token: string) {
  if (!LINK.test(token)) return null;
  const { data } = await createServiceClient()
    .from("events")
    .select(
      "id, organization_id, name, event_date, location, branding, client_expires_at, purged_at, public_gallery, settings, run, guest_revealed_at",
    )
    .or(byLink("client_token", token))
    .not("client_token", "is", null)
    .limit(1)
    .maybeSingle();
  if (
    !data ||
    data.purged_at ||
    (data.client_expires_at && new Date(data.client_expires_at) <= new Date())
  )
    return null;
  return data;
}

type GalleryEvent = NonNullable<Awaited<ReturnType<typeof eventByClientToken>>>;

export async function loadGallery(token: string): Promise<Gallery> {
  const ev = await eventByClientToken(token);
  return ev ? galleryOf(ev, true) : { state: "gone" };
}

/** Galeri publik dari halaman tamu: hanya kalau klien mengaktifkannya dan halaman tamu masih berlaku. */
export async function loadPublicGallery(sessionId: string): Promise<Gallery> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return { state: "gone" };
  const { data: s } = await createServiceClient()
    .from("sessions")
    .select(
      "hidden_at, deleted_at, events!inner(id, organization_id, name, event_date, location, branding, client_expires_at, guest_expires_at, purged_at, public_gallery, settings, run, guest_revealed_at)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  const ev = s?.events;
  const until = ev?.guest_expires_at ?? ev?.client_expires_at;
  if (!s || !ev?.public_gallery || ev.purged_at || s.hidden_at || s.deleted_at)
    return { state: "gone" };
  if (until && new Date(until) <= new Date()) return { state: "gone" };
  return galleryOf(ev, false);
}

/** Galeri publik dari QR live slideshow (`/l/{slug atau liveToken}`): syarat sama dengan dari halaman tamu. */
export async function loadPublicGalleryByLive(token: string): Promise<Gallery> {
  if (!LINK.test(token)) return { state: "gone" };
  const { data: ev } = await createServiceClient()
    .from("events")
    .select(
      "id, organization_id, name, event_date, location, branding, client_expires_at, guest_expires_at, purged_at, public_gallery, settings, run, guest_revealed_at",
    )
    .or(byLink("live_token", token))
    .not("live_token", "is", null)
    .limit(1)
    .maybeSingle();
  const until = ev?.guest_expires_at ?? ev?.client_expires_at;
  if (!ev?.public_gallery || ev.purged_at || (until && new Date(until) <= new Date()))
    return { state: "gone" };
  return galleryOf(ev, false);
}

async function galleryOf(ev: GalleryEvent, withFavorites: boolean): Promise<Gallery> {
  const db = createServiceClient();
  const { data: sessions } = await db
    .from("sessions")
    .select("id, started_at, source, group_name")
    .eq("event_id", ev.id)
    .eq("organization_id", ev.organization_id)
    .eq("is_test", false)
    .is("hidden_at", null)
    .is("deleted_at", null)
    // Guest Cam (#197): mode "setelah acara" tertutup sampai acara selesai / dibuka owner.
    .in("source", guestPhotosVisible(ev) ? ["booth", "stage", "guest"] : ["booth", "stage"])
    .order("started_at")
    .limit(10000);
  const started = new Map((sessions ?? []).map((s) => [s.id, s.started_at]));
  const meta = new Map((sessions ?? []).map((s) => [s.id, s]));
  const ids = [...started.keys()];
  const assets: { id: string; session_id: string; kind: string; idx: number; r2_key: string }[] =
    [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from("assets")
      .select("id, session_id, kind, idx, r2_key")
      .eq("organization_id", ev.organization_id)
      .in("session_id", ids.slice(i, i + 200))
      .in("kind", ["strip_web", "thumb_strip", "original", "thumb_original", "animation", "audio"])
      .is("hidden_at", null)
      // Moderasi Guest Cam: hanya yang disetujui (booth/stage selalu null).
      .is("review_status", null);
    assets.push(...(data ?? []));
  }
  const { data: favs } = withFavorites
    ? await db.from("favorites").select("asset_id").eq("event_id", ev.id)
    : { data: [] };
  const fav = new Set((favs ?? []).map((f) => f.asset_id));
  const byKey = new Map(assets.map((a) => [`${a.session_id}:${a.kind}:${a.idx}`, a]));
  const KIND = {
    strip_web: "strip",
    original: "original",
    animation: "animation",
    audio: "audio",
  } as const;
  const THUMB: Record<string, string> = { strip_web: "thumb_strip", original: "thumb_original" };
  const EXT: Record<string, string> = { animation: "gif", strip_web: "jpg", original: "jpg" };
  const SOURCE: Record<string, GalleryPhoto["source"]> = { stage: "stage", guest: "guest" };
  const photos = await Promise.all(
    assets
      .filter((a): a is typeof a & { kind: keyof typeof KIND } => a.kind in KIND)
      .map(async (a): Promise<GalleryPhoto> => {
        const thumb = byKey.get(`${a.session_id}:${THUMB[a.kind]}:${a.idx}`) ?? a;
        return {
          id: a.id,
          kind: KIND[a.kind],
          sessionId: a.session_id,
          hour: hourWib(started.get(a.session_id) ?? ev.event_date),
          source: SOURCE[meta.get(a.session_id)?.source ?? ""] ?? "booth",
          group:
            meta.get(a.session_id)?.source === "booth"
              ? null
              : (meta.get(a.session_id)?.group_name ??
                `Tamu · ${clockWib(started.get(a.session_id) ?? ev.event_date)}`),
          time: clockWib(started.get(a.session_id) ?? ev.event_date),
          thumb: await presignGet(key(thumb.r2_key), 6 * 3600),
          full: await presignGet(key(a.r2_key), 6 * 3600),
          download: await presignDownload(
            key(a.r2_key),
            `tetra-${a.session_id}-${KIND[a.kind]}-${a.idx}.${EXT[a.kind] ?? a.r2_key.split(".").pop()}`,
            6 * 3600,
          ),
          favorite: fav.has(a.id),
        };
      }),
  );
  photos.sort(
    (x, y) =>
      (started.get(x.sessionId) ?? "").localeCompare(started.get(y.sessionId) ?? "") ||
      x.id.localeCompare(y.id),
  );
  const branding = (ev.branding ?? {}) as { tagline?: string };
  const start = new Date(`${ev.event_date}T00:00:00+07:00`).getTime();
  return {
    state: "ok",
    eventId: ev.id,
    name: ev.name,
    tagline: branding.tagline ?? null,
    date: ev.event_date,
    location: ev.location,
    expiresAt: ev.client_expires_at,
    daysTotal: ev.client_expires_at
      ? Math.round((new Date(ev.client_expires_at).getTime() - start) / 86_400_000)
      : null,
    publicGallery: ev.public_gallery,
    photos,
  };
}
