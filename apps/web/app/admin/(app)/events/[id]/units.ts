"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/supabase/server";
import { createUnit } from "../unit-create";

const Unit = z.object({
  eventId: z.uuid(),
  spot: z.number().int().min(2).max(10),
  size: z.enum(["2R", "4R", "polaroid"]),
  deviceId: z.uuid().nullable(),
});

export async function createUnitEvent(
  input: z.input<typeof Unit>,
): Promise<{ ok: true; slug: string } | { ok: false; message: string }> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const p = Unit.safeParse(input);
  if (!p.success) return { ok: false, message: "Pilih ukuran frame dulu" };
  const r = await createUnit(db, orgId, user.id, p.data);
  if (r.ok) revalidatePath("/admin");
  return r;
}

/** Kunci event unit ke satu laptop (atau lepas ke semua laptop), supaya crew tidak memilih event unit lain. */
export async function setUnitDevice(eventId: string, deviceId: string | null) {
  const { db, orgId } = await requireMember(["owner", "admin"]);
  const id = z.uuid().parse(eventId);
  const dev = z.uuid().nullable().parse(deviceId);
  await db.from("event_devices").delete().eq("event_id", id).eq("organization_id", orgId);
  if (dev)
    await db.from("event_devices").insert({ organization_id: orgId, event_id: id, device_id: dev });
  await db.from("events").update({ all_devices: !dev }).eq("id", id).eq("organization_id", orgId);
  revalidatePath("/admin/(app)/events/[id]", "layout");
}
