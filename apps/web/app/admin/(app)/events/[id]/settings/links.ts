"use server";
import { newAccessToken } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/supabase/server";

/** Link klien (/g) dan live (/live): buat/buat ulang (token lama langsung mati) atau cabut. Owner/admin. */
export async function setLink(eventId: string, kind: "client" | "live", action: "new" | "revoke") {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const value = action === "new" ? newAccessToken() : null;
  await db
    .from("events")
    .update(kind === "client" ? { client_token: value } : { live_token: value })
    .eq("id", eventId)
    .eq("organization_id", orgId);
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `link.${kind}.${action}`,
    target: eventId,
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
}
