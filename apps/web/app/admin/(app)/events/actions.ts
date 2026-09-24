"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { buildBundle, DEFAULT_TEMPLATE } from "@/lib/event-bundle";
import { requireMember } from "@/lib/supabase/server";

const NewEvent = z.object({
  name: z.string().trim().min(1).max(120),
  event_date: z.iso.date(),
});

/** Buat event mode event dengan pengaturan & template default, lalu buka pengaturannya. */
export async function createEvent(_prev: string | null, form: FormData): Promise<string | null> {
  const { db, orgId, user } = await requireMember(["owner", "admin"]);
  const p = NewEvent.safeParse({ name: form.get("name"), event_date: form.get("event_date") });
  if (!p.success) return "Isi nama dan tanggal event";
  const { data: ev, error } = await db
    .from("events")
    .insert({
      organization_id: orgId,
      name: p.data.name,
      event_date: p.data.event_date,
      mode: "event",
      status: "ready",
      created_by: user.id,
      settings: { template: DEFAULT_TEMPLATE },
    })
    .select("id")
    .single();
  if (error || !ev) return "Gagal membuat event, coba lagi";
  const bundle = buildBundle({
    id: ev.id,
    name: p.data.name,
    eventDate: p.data.event_date,
    settings: {},
    template: DEFAULT_TEMPLATE,
    branding: {},
    overlay: null,
  });
  await db.from("events").update({ bundle }).eq("id", ev.id).eq("organization_id", orgId);
  redirect(`/admin/events/${ev.id}/settings`);
}
