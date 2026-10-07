"use server";
import { newAccessToken } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { bumpBundle } from "@/lib/bundle-bump";
import { requireMember } from "@/lib/supabase/server";

/**
 * Link klien (/g), live (/live), dan Guest Cam (/c, #197): aktifkan atau cabut. Alamatnya slug event (#147); kolom token = tanda aktif
 * (token acak baru tiap diaktifkan, jadi link token lama yang pernah dicabut tetap mati). Owner/admin.
 */
export async function setLink(
  eventId: string,
  kind: "client" | "live" | "guest",
  action: "new" | "revoke",
) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const value = action === "new" ? newAccessToken() : null;
  await db
    .from("events")
    .update(
      kind === "client"
        ? { client_token: value }
        : kind === "live"
          ? { live_token: value }
          : { guest_token: value },
    )
    .eq("id", eventId)
    .eq("organization_id", orgId);
  // Link live = syarat galeri acara dari QR TV Photo Stage (#199).
  if (kind === "live") await bumpBundle(db, orgId, eventId);
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `link.${kind}.${action}`,
    target: eventId,
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
}
