import "server-only";
import { SESSION_ID_PATTERN } from "@tetra/shared";
import { type LeadField, leadCapture } from "@/lib/leads";
import { presignGet } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

/** Data halaman tamu `/s/{id}` (FSD §2). Dibaca di server; service role tidak pernah ke browser. */
export type GuestEvent = { name: string; date: string };
export type GuestAsset = { kind: string; idx: number; url: string };
/** Form lead yang harus/boleh diisi tamu ini (belum pernah mengisi untuk sesi ini). */
export type GuestLead = { mode: "gate" | "optional"; fields: LeadField[]; consentText: string };
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
      lead: GuestLead | null;
    }
  | {
      state: "ready";
      event: GuestEvent;
      assets: GuestAsset[];
      expiresAt: string | null;
      lead: GuestLead | null;
      /** Klien mengaktifkan galeri publik → link "Lihat galeri acara". */
      publicGallery: boolean;
    };

export async function loadGuest(sessionId: string, now = new Date()): Promise<GuestState> {
  if (!SESSION_ID_PATTERN.test(sessionId)) return { state: "unknown" };
  const db = createServiceClient();
  const { data: s } = await db
    .from("sessions")
    .select(
      "id, organization_id, started_at, upload_status, asset_count, hidden_at, deleted_at, events!inner(name, event_date, guest_expires_at, client_expires_at, purged_at, lead_capture, public_gallery)",
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

  const cfg = leadCapture(e.lead_capture);
  const { count: leads } = cfg
    ? await db
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("session_id", s.id)
        .eq("organization_id", s.organization_id)
    : { count: 0 };
  const lead =
    cfg && !leads ? { mode: cfg.mode, fields: cfg.fields, consentText: cfg.consentText } : null;
  // Mode gate: URL foto tidak pernah dikirim sebelum lead masuk (bukan sekadar disembunyikan di browser).
  const locked = lead?.mode === "gate";

  const { data: rows } = await db
    .from("assets")
    .select("kind, idx, r2_key")
    .eq("session_id", s.id)
    .eq("organization_id", s.organization_id)
    .order("kind")
    .order("idx");
  // Kunci "…#x" (data uji) → objek tanpa fragmen.
  const assets = await Promise.all(
    (locked ? [] : (rows ?? [])).map(async (a) => ({
      kind: a.kind,
      idx: a.idx,
      url: await presignGet(a.r2_key.split("#")[0] ?? a.r2_key),
    })),
  );
  if (s.upload_status !== "complete")
    return {
      state: "pending",
      event,
      startedAt: s.started_at,
      assets,
      total: s.asset_count ?? 0,
      lead,
    };
  return { state: "ready", event, assets, expiresAt, lead, publicGallery: e.public_gallery };
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
