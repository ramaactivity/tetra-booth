import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@tetra/db";
import { type EventRun, parseRun } from "@tetra/shared";

/**
 * Ubah `events.run` (timer event, DECISIONS #149) dengan kunci optimis `updated_at`: admin dan booth bisa menulis
 * bersamaan, jadi baca → terapkan → tulis hanya kalau baris belum berubah (maks. 4 percobaan).
 * `fn` mengembalikan run baru, atau null = tidak sah. Hasil: run tersimpan, null = event tidak ada / tidak sah.
 */
export async function updateRun(
  db: SupabaseClient<Database>,
  eventId: string,
  orgId: string,
  fn: (run: EventRun) => EventRun | null,
): Promise<EventRun | null> {
  for (let i = 0; i < 4; i++) {
    const { data: ev } = await db
      .from("events")
      .select("run, updated_at")
      .eq("id", eventId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!ev) return null;
    const before = parseRun(ev.run);
    const next = fn(before);
    if (!next) return null;
    if (next === before) return before;
    const { data } = await db
      .from("events")
      .update({ run: next })
      .eq("id", eventId)
      .eq("organization_id", orgId)
      .eq("updated_at", ev.updated_at)
      .select("id");
    if (data?.length) return next;
  }
  throw new Error("run: terlalu banyak tulisan bersamaan");
}
