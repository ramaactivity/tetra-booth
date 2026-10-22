import "server-only";
import { readableLink } from "./guest-link";
import type { createServiceClient } from "./supabase/service";

type Db = Pick<ReturnType<typeof createServiceClient>, "from">;

/** Alamat dipakai event lain (rapi atau token)? */
export async function guestLinkTaken(db: Db, eventId: string, link: string) {
  const { data } = await db
    .from("events")
    .select("id")
    .or(`guest_link.eq.${link},guest_token.eq.${link}`)
    .neq("id", eventId)
    .limit(1);
  return !!data?.length;
}

/** Alamat rapi pertama yang bebas: rafi-dinda, rafi-dinda-2, … (selain alamat event ini sekarang). */
export async function freeGuestLink(db: Db, eventId: string, orgId: string) {
  const { data: ev } = await db
    .from("events")
    .select("name, guest_link")
    .eq("id", eventId)
    .eq("organization_id", orgId)
    .single();
  const base = readableLink(ev?.name ?? "");
  for (let i = 1; i < 50; i++) {
    const c = i === 1 ? base : `${base.slice(0, 36)}-${i}`;
    if (c !== ev?.guest_link && !(await guestLinkTaken(db, eventId, c))) return c;
  }
  return null;
}
