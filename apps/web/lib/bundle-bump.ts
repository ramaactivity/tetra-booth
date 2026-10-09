import "server-only";
import type { createServiceClient } from "./supabase/service";

/**
 * Naikkan `bundle_version` tanpa mengubah isi bundle (#199): booth mengunduh ulang bundle saat versi berubah, jadi info
 * yang dihitung server (galeri publik, link live) sampai ke laptop stage tanpa admin menekan Simpan.
 */
export async function bumpBundle(
  db: Pick<ReturnType<typeof createServiceClient>, "from">,
  orgId: string,
  eventId: string,
) {
  const { data } = await db
    .from("events")
    .select("bundle_version")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!data) return;
  await db
    .from("events")
    .update({ bundle_version: data.bundle_version + 1 })
    .eq("id", eventId)
    .eq("organization_id", orgId);
}
