import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Sinkron Tetra Ops ↔ Booth (kontrak tetra-ops/docs/INTEGRASI-TETRA-BOOTH.md v0.2, DECISIONS #173).
 * Env: `TETRA_OPS_ORG_ID` (organisasi pemilik integrasi), `TETRA_OPS_WEBHOOK_SECRET` (HMAC webhook masuk),
 * `TETRA_OPS_API_TOKEN` (Bearer GET /api/ops/…). Kosong = endpoint menjawab 503.
 */
export const opsOrgId = () => z.uuid().safeParse(process.env.TETRA_OPS_ORG_ID).data ?? null;

const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** `Authorization: Bearer <token>` cocok dengan token yang diharapkan (waktu-konstan). */
export const bearerOk = (header: string | null, token: string) =>
  !!token && same(header ?? "", `Bearer ${token}`);

/** Toleransi jam antara Ops dan Booth (§4.1). */
export const SIGNATURE_TOLERANCE_S = 300;

/** `X-Tetra-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>` (§4.1). */
export function opsSignatureOk(raw: string, header: string | null, secret: string, nowS: number) {
  const parts = Object.fromEntries(
    (header ?? "").split(",").map((p) => p.trim().split("=", 2) as [string, string]),
  );
  const t = Number(parts.t);
  if (!secret || !Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  if (Math.abs(nowS - t) > SIGNATURE_TOLERANCE_S) return false;
  return same(createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex"), parts.v1 ?? "");
}

export const OPS_EVENTS = [
  "booking.confirmed",
  "booking.updated",
  "booking.cancelled",
  "design.approved",
] as const;

export const OpsWebhookBody = z.object({
  event: z.enum(OPS_EVENTS),
  delivery_id: z.uuid(),
  occurred_at: z.iso.datetime({ offset: true }),
  // Bentuk = satu item GET /api/booth/bookings; field lain ikut disimpan apa adanya.
  booking: z.looseObject({
    project_id: z.string().min(1).max(64),
    design: z.looseObject({}).nullable().optional(),
  }),
});
export type OpsWebhookBody = z.infer<typeof OpsWebhookBody>;

export type OpsSync = {
  cancelled_at?: string;
  updated_at?: string;
  design_approved_at?: string;
  design?: Record<string, unknown>;
  /** Desain Ops terakhir dipasang lewat "Pasang desain dari Tetra Ops" (#177). */
  design_installed_at?: string;
};

const newer = (prev: string | undefined, at: string) => !prev || Date.parse(at) > Date.parse(prev);

/**
 * Tanda Ops berikutnya untuk satu event. Urutan kiriman tidak dijamin (§4.4): field hanya ditimpa oleh kabar yang
 * lebih baru. `booking.confirmed` tidak menandai apa pun (event Booth dibuat admin lewat wizard impor).
 */
export function nextOpsSync(prev: OpsSync, body: OpsWebhookBody): OpsSync {
  const at = body.occurred_at;
  switch (body.event) {
    case "booking.cancelled":
      return newer(prev.cancelled_at, at) ? { ...prev, cancelled_at: at } : prev;
    case "booking.updated":
      return newer(prev.updated_at, at) ? { ...prev, updated_at: at } : prev;
    case "design.approved": {
      if (!newer(prev.design_approved_at, at)) return prev;
      const { design: _old, ...rest } = prev;
      const design = body.booking.design;
      return design
        ? { ...rest, design_approved_at: at, design }
        : { ...rest, design_approved_at: at };
    }
    default:
      return prev;
  }
}

/** Data event Booth yang dibandingkan dengan booking Ops. */
export type DriftEvent = {
  event_date: string;
  location: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
};
type DriftBooking = {
  event_date: string;
  venue_name: string | null;
  venue_city: string | null;
  start_time: string | null;
  end_time: string | null;
};
export type OpsDrift =
  | { kind: "missing" }
  | { kind: "changed"; fields: { field: "date" | "start" | "end" | "location"; ops: string }[] };

const hm = (v: string | null) => (v && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : "");

/**
 * Selisih event Booth vs booking Ops sekarang (#176, jembatan sebelum webhook fase 5): klien pindah tanggal atau
 * venue di Ops, event Booth hasil impor tidak ikut berubah. `null` = sama. Booking tidak ada di daftar Ops
 * (batal, selesai, atau dipindah > 180 hari) = `missing`. Lokasi dibandingkan dengan rumus impor wizard.
 */
export function opsDrift(ev: DriftEvent, b: DriftBooking | undefined): OpsDrift | null {
  if (!b) return { kind: "missing" };
  const loc = [b.venue_name, b.venue_city].filter(Boolean).join(", ").slice(0, 120);
  const fields: { field: "date" | "start" | "end" | "location"; ops: string }[] = [];
  if (b.event_date !== ev.event_date) fields.push({ field: "date", ops: b.event_date });
  if (hm(b.start_time) && hm(b.start_time) !== hm(ev.scheduled_start))
    fields.push({ field: "start", ops: hm(b.start_time) });
  if (hm(b.end_time) && hm(b.end_time) !== hm(ev.scheduled_end))
    fields.push({ field: "end", ops: hm(b.end_time) });
  if (loc && loc !== (ev.location ?? "")) fields.push({ field: "location", ops: loc });
  return fields.length ? { kind: "changed", fields } : null;
}

/** Autentikasi panggilan Ops → Booth (Bearer `TETRA_OPS_API_TOKEN`); hasil = org Tetra, atau Response gagal. */
export function opsCaller(req: Request): string | Response {
  const token = process.env.TETRA_OPS_API_TOKEN ?? "";
  const org = opsOrgId();
  if (!token || !org) return new Response("not configured", { status: 503 });
  if (!bearerOk(req.headers.get("authorization"), token))
    return new Response("unauthorized", { status: 401 });
  return org;
}
