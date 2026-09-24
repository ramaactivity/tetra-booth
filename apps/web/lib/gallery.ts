import "server-only";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/** Galeri klien `/g/{token}` (FSD §3): data event + foto yang tidak disembunyikan/dihapus. */
export type GalleryPhoto = {
  id: string;
  kind: "strip" | "original";
  sessionId: string;
  hour: number;
  thumb: string;
  full: string;
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

/** Event dari token klien; kedaluwarsa/purge/token dicabut → gone. */
export async function eventByClientToken(token: string) {
  if (!/^[\w-]{20,64}$/.test(token)) return null;
  const { data } = await createServiceClient()
    .from("events")
    .select(
      "id, organization_id, name, event_date, location, branding, client_expires_at, purged_at",
    )
    .eq("client_token", token)
    .maybeSingle();
  if (
    !data ||
    data.purged_at ||
    (data.client_expires_at && new Date(data.client_expires_at) <= new Date())
  )
    return null;
  return data;
}

export async function loadGallery(token: string): Promise<Gallery> {
  const ev = await eventByClientToken(token);
  if (!ev) return { state: "gone" };
  const db = createServiceClient();
  const { data: sessions } = await db
    .from("sessions")
    .select("id, started_at")
    .eq("event_id", ev.id)
    .eq("organization_id", ev.organization_id)
    .is("hidden_at", null)
    .is("deleted_at", null)
    .order("started_at")
    .limit(10000);
  const started = new Map((sessions ?? []).map((s) => [s.id, s.started_at]));
  const ids = [...started.keys()];
  const assets: { id: string; session_id: string; kind: string; idx: number; r2_key: string }[] =
    [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db
      .from("assets")
      .select("id, session_id, kind, idx, r2_key")
      .eq("organization_id", ev.organization_id)
      .in("session_id", ids.slice(i, i + 200))
      .in("kind", ["strip_web", "thumb_strip", "original", "thumb_original"]);
    assets.push(...(data ?? []));
  }
  const { data: favs } = await db.from("favorites").select("asset_id").eq("event_id", ev.id);
  const fav = new Set((favs ?? []).map((f) => f.asset_id));
  const byKey = new Map(assets.map((a) => [`${a.session_id}:${a.kind}:${a.idx}`, a]));
  const photos = await Promise.all(
    assets
      .filter((a) => a.kind === "strip_web" || a.kind === "original")
      .map(async (a): Promise<GalleryPhoto> => {
        const thumb =
          byKey.get(
            `${a.session_id}:${a.kind === "strip_web" ? "thumb_strip" : "thumb_original"}:${a.idx}`,
          ) ?? a;
        return {
          id: a.id,
          kind: a.kind === "strip_web" ? "strip" : "original",
          sessionId: a.session_id,
          hour: hourWib(started.get(a.session_id) ?? ev.event_date),
          thumb: await presignGet(key(thumb.r2_key), 6 * 3600),
          full: await presignGet(key(a.r2_key), 6 * 3600),
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
    photos,
  };
}
