"use server";
import { newAccessToken } from "@tetra/shared";
import { revalidatePath } from "next/cache";
import { bumpBundle } from "@/lib/bundle-bump";
import { GUEST_LINK } from "@/lib/guest-link";
import { freeGuestLink, guestLinkTaken } from "@/lib/guest-link-db";
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
  // Snapbook (#231): alamat rapi dari nama acara; dibuat ulang = alamat lain (rafi-dinda-2) supaya QR lama mati.
  const guest =
    kind === "guest" && value
      ? { guest_token: value, guest_link: await freeGuestLink(db, eventId, orgId) }
      : { guest_token: value };
  await db
    .from("events")
    .update(
      kind === "client" ? { client_token: value } : kind === "live" ? { live_token: value } : guest,
    )
    .eq("id", eventId)
    .eq("organization_id", orgId);
  // Link live → QR galeri di TV stage (#199); link Guest Cam → QR di layar Print Station (#224).
  if (kind === "live" || kind === "guest") await bumpBundle(db, orgId, eventId);
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: `link.${kind}.${action}`,
    target: eventId,
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
}

/** Ubah alamat Snapbook manual (#231), mis. `adel-alpi`. Token tetap, jadi QR token lama tetap jalan. */
export async function setGuestLink(eventId: string, raw: string) {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const link = raw.trim().toLowerCase();
  if (!GUEST_LINK.test(link))
    return { error: "Pakai huruf kecil, angka, dan tanda hubung (3–40 karakter)." };
  if (await guestLinkTaken(db, eventId, link))
    return { error: "Alamat ini sudah dipakai acara lain." };
  await db
    .from("events")
    .update({ guest_link: link })
    .eq("id", eventId)
    .eq("organization_id", orgId);
  await bumpBundle(db, orgId, eventId);
  await db.from("audit_logs").insert({
    organization_id: orgId,
    actor_user_id: user.id,
    action: "link.guest.rename",
    target: eventId,
  });
  revalidatePath("/admin/(app)/events/[id]", "layout");
  return { error: null };
}
