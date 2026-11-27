"use server";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/supabase/server";

/**
 * Arsipkan / kembalikan event (audit 27 Nov): event dobel atau uji hilang dari daftar, ringkasan, dan daftar event
 * booth. Foto, sesi, dan link galeri klien tidak disentuh; sesi offline tetap boleh terkirim (deviceMayUseEvent).
 */
export async function setArchived(eventId: string, archived: boolean) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const { error } = await db
    .from("events")
    .update({ status: archived ? "archived" : "ready" })
    .eq("id", eventId)
    .eq("organization_id", orgId);
  if (error) return { error: "Gagal menyimpan. Coba lagi." };
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: archived ? "event.archive" : "event.unarchive",
    target: eventId,
  });
  revalidatePath("/admin", "layout");
  return { error: null };
}
