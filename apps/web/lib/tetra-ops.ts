import "server-only";
import type { LayoutPaper } from "@tetra/shared";
import { z } from "zod";
import { ymdWib } from "./events";
import { type DriftEvent, type OpsDrift, opsDrift } from "./ops-sync";

/**
 * Klien baca-saja Tetra Ops (DECISIONS #150): booking & paket untuk wizard Buat event. Env `TETRA_OPS_URL`
 * (mis. https://booking.tetraphoto.com) + `TETRA_OPS_TOKEN` (= BOOTH_API_TOKEN di Tetra Ops). Tidak diisi =
 * fitur disembunyikan; paket tetap bisa diisi manual.
 */
export const opsConfigured = () => !!process.env.TETRA_OPS_URL && !!process.env.TETRA_OPS_TOKEN;

const str = z.string().max(200).nullable();
export const OpsBooking = z.object({
  project_id: z.string().min(1).max(64),
  client_name: str,
  event_title: str.optional(),
  event_category: str,
  event_category_label: str.optional(),
  event_date: z.iso.date(),
  start_time: str,
  end_time: str,
  venue_name: str,
  venue_city: str,
  service_type: str,
  frame_size: str,
  package_name: str,
  package_duration_hours: z.number().positive().max(48).nullable(),
  // Usulan Booth #182 (aditif): daftar grup Photo Stage dari portal klien/WO.
  stage_groups: z.array(z.string().max(120)).max(300).nullable().optional(),
  // Kontrak v0.5 §2.2 (aditif): desain frame dari modul desain Ops.
  design: z
    .looseObject({
      status: z.string().max(20).nullable().optional(),
      approved_at: z.string().max(40).nullable().optional(),
      frame_size: z.string().max(20).nullable().optional(),
      orientation: z.enum(["portrait", "landscape"]).nullable().optional(),
      frame_url: z.string().max(4000).nullable().optional(),
      spots: z
        .array(
          z.looseObject({
            spot_no: z.number().int(),
            frame_size: z.string().max(20).nullable().optional(),
            orientation: z.enum(["portrait", "landscape"]).nullable().optional(),
            frame_url: z.string().max(4000).nullable().optional(),
          }),
        )
        .max(10)
        .optional(),
    })
    .nullable()
    .optional(),
});
export type OpsBooking = z.infer<typeof OpsBooking>;

/** Ukuran frame Ops → kertas Booth (sama dengan wizard impor, #162). */
const OPS_PAPER: Record<string, LayoutPaper> = { "2R": "2x6x2", "4R": "4R", polaroid: "3x4x2" };
export const OPS_PAPER_OF = (size: string | null): LayoutPaper | undefined =>
  size ? OPS_PAPER[size] : undefined;

/** Desain frame yang sudah di-ACC untuk event Booth ini (#177), atau null. */
export type OpsDesign = {
  frameUrl: string;
  frameSize: string | null;
  orientation: "portrait" | "landscape" | null;
  approvedAt: string | null;
};
/**
 * Desain ACC dari booking Ops untuk satu event Booth. Event multi-unit dibuat satu per spot dengan nama
 * "… · Spot N" (kontrak §2.2): spot ≥ 2 diambil dari `design.spots`, spot 1 dari field level atas.
 */
export function approvedDesign(b: OpsBooking | undefined, eventName: string): OpsDesign | null {
  const d = b?.design;
  if (!d || d.status !== "approved") return null;
  const n = Number(/Spot (\d+)/i.exec(eventName)?.[1] ?? 1);
  const s = n > 1 ? d.spots?.find((x) => x.spot_no === n) : d;
  if (!s?.frame_url) return null;
  return {
    frameUrl: s.frame_url,
    frameSize: s.frame_size ?? null,
    orientation: s.orientation ?? null,
    approvedAt: d.approved_at ?? null,
  };
}
export const OpsPackage = z.object({
  name: z.string().max(200),
  category: str,
  frame_size: str,
  duration_hours: z.number().positive().max(48).nullable(),
});
export type OpsPackage = z.infer<typeof OpsPackage>;

async function get<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const base = (process.env.TETRA_OPS_URL ?? "").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    headers: { authorization: `Bearer ${process.env.TETRA_OPS_TOKEN ?? ""}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Tetra Ops ${path}: ${res.status}`);
  return schema.parse(await res.json());
}

/** Rentang maksimum `from`–`to` yang diterima Tetra Ops. */
export const OPS_MAX_DAYS = 180;
/** Booking di rentang tanggal (YYYY-MM-DD, maks. 180 hari); dipilah per bulan di wizard (#152). */
export const opsBookings = (from: string, to: string) =>
  get(
    `/api/booth/bookings?from=${from}&to=${to}`,
    z.object({ bookings: z.array(OpsBooking).max(1000) }),
  ).then((r) => r.bookings);
export const opsPackages = () =>
  get("/api/booth/packages", z.object({ packages: z.array(OpsPackage).max(500) })).then(
    (r) => r.packages,
  );

/**
 * Booking Ops saat ini untuk event Booth mendatang hasil impor (#176, #177). `null` = bukan event Ops, Ops tidak
 * terhubung/gagal dihubungi, atau event sudah lewat; `{ booking: undefined }` = tidak ada lagi di daftar Ops.
 */
export async function opsBookingNow(ev: {
  event_date: string;
  ops_project_id: string | null;
}): Promise<{ booking: OpsBooking | undefined } | null> {
  const today = ymdWib(Date.now());
  if (!ev.ops_project_id || !opsConfigured() || ev.event_date < today) return null;
  try {
    const list = await opsBookings(today, ymdWib(Date.now() + (OPS_MAX_DAYS - 1) * 86_400_000));
    return { booking: list.find((b) => b.project_id === ev.ops_project_id) };
  } catch (e) {
    console.warn(`[tetra-ops] ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** Selisih event Booth vs booking Ops saat ini (#176); `null` = sama atau tidak bisa dibandingkan. */
export const opsDriftOf = (
  ev: DriftEvent,
  now: { booking: OpsBooking | undefined } | null,
): OpsDrift | null => (now ? opsDrift(ev, now.booking) : null);
