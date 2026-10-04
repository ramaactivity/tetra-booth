import "server-only";
import { z } from "zod";

/**
 * Klien baca-saja Tetra Ops (DECISIONS #150): booking & paket untuk wizard Buat event. Env `TETRA_OPS_URL`
 * (mis. https://tetra-ops-lac.vercel.app) + `TETRA_OPS_TOKEN` (= BOOTH_API_TOKEN di Tetra Ops). Tidak diisi =
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
});
export type OpsBooking = z.infer<typeof OpsBooking>;
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
