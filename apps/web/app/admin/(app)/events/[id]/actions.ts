"use server";
import { revalidatePath } from "next/cache";
import { deleteObjects } from "@/lib/r2";
import { requireMember } from "@/lib/supabase/server";

/**
 * Moderasi sesi (FSD §5, desain E8): sembunyikan/tampilkan atau hapus (foto di R2 ikut dihapus).
 * Owner/admin; semua aksi masuk audit_logs.
 */
export async function moderate(
  eventId: string,
  sessionId: string,
  action: "hide" | "show" | "delete",
) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const scope = db
    .from("sessions")
    .update(
      action === "delete"
        ? { deleted_at: new Date().toISOString() }
        : { hidden_at: action === "hide" ? new Date().toISOString() : null },
    );
  const { data } = await scope
    .eq("id", sessionId)
    .eq("event_id", eventId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (!data) return;
  if (action === "delete") {
    const { data: assets } = await db
      .from("assets")
      .select("r2_key")
      .eq("session_id", sessionId)
      .eq("organization_id", orgId);
    await deleteObjects((assets ?? []).map((a) => a.r2_key.split("#")[0] ?? a.r2_key));
    await db.from("assets").delete().eq("session_id", sessionId).eq("organization_id", orgId);
  }
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `session.${action}`,
    target: sessionId,
    meta: { eventId },
  });
  revalidatePath(`/admin/events/${eventId}`);
}
