import "server-only";
import { SESSION_ID_PATTERN } from "@tetra/shared";
import { createServiceClient } from "@/lib/supabase/service";

/** Data halaman tamu `/s/{id}` (FSD §2). Dibaca di server; service role tidak pernah ke browser. */
export type GuestEvent = { name: string; date: string };
export type GuestAsset = { kind: string; idx: number; url: string };
export type GuestState =
  | { state: "unknown" }
  | { state: "removed"; event: GuestEvent }
  | { state: "expired"; event: GuestEvent; expiredAt: string }
  | {
      state: "pending";
      event: GuestEvent;
      startedAt: string;
      assets: GuestAsset[];
      total: number;
    }
  | { state: "ready"; event: GuestEvent; assets: GuestAsset[]; expiresAt: string | null };

export async function loadGuest(sessionId: string, now = new Date()): Promise<GuestState> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return { state: "unknown" };
  const db = createServiceClient();
  const { data: s } = await db
    .from("sessions")
    .select(
      "id, organization_id, started_at, upload_status, asset_count, hidden_at, deleted_at, events!inner(name, event_date, guest_expires_at, client_expires_at, purged_at)",
    )
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return { state: "unknown" };
  const e = s.events;
  const event = { name: e.name, date: e.event_date };
  if (s.hidden_at || s.deleted_at) return { state: "removed", event };
  const expiresAt = e.guest_expires_at ?? e.client_expires_at;
  if (e.purged_at || (expiresAt && new Date(expiresAt) <= now))
    return { state: "expired", event, expiredAt: e.purged_at ?? expiresAt ?? now.toISOString() };

  const { data: rows } = await db
    .from("assets")
    .select("kind, idx, r2_key")
    .eq("session_id", s.id)
    .eq("organization_id", s.organization_id)
    .order("kind")
    .order("idx");
  const media = process.env.NEXT_PUBLIC_MEDIA_URL;
  const assets = (rows ?? []).map((a) => ({
    kind: a.kind,
    idx: a.idx,
    url: `${media}/${a.r2_key}`,
  }));
  if (s.upload_status !== "complete")
    return { state: "pending", event, startedAt: s.started_at, assets, total: s.asset_count ?? 0 };
  return { state: "ready", event, assets, expiresAt };
}

const tz = { timeZone: "Asia/Jakarta" } as const;
/** "12 Oktober 2026" dari tanggal event (YYYY-MM-DD). */
export const longDate = (d: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`));
/** "11 Nov 2026" dari timestamp. */
export const shortDate = (ts: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", ...tz })
    .format(new Date(ts))
    .replace(".", "");
/** "21.42" dari timestamp (WIB). */
export const clock = (ts: string) =>
  new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", ...tz }).format(
    new Date(ts),
  );
