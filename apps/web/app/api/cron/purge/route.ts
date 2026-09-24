import { deleteObjects, listKeys } from "@/lib/r2";
import { createServiceClient } from "@/lib/supabase/service";

export const maxDuration = 60;

/**
 * Retensi harian (TSD §9, Vercel Cron 02.00 WIB): event dengan purge_at lewat → hapus semua objek R2 di
 * prefix event + baris aset, isi purged_at. Idempoten; kalau CRON_SECRET diisi, wajib header Vercel Cron.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("unauthorized", { status: 401 });
  const db = createServiceClient();
  const { data: due } = await db
    .from("events")
    .select("id, organization_id")
    .lt("purge_at", new Date().toISOString())
    .is("purged_at", null)
    .limit(20);
  const done: string[] = [];
  for (const ev of due ?? []) {
    await deleteObjects(await listKeys(`${ev.organization_id}/${ev.id}/`));
    const { data: sessions } = await db
      .from("sessions")
      .select("id")
      .eq("event_id", ev.id)
      .eq("organization_id", ev.organization_id);
    const ids = (sessions ?? []).map((s) => s.id);
    for (let i = 0; i < ids.length; i += 200)
      await db
        .from("assets")
        .delete()
        .eq("organization_id", ev.organization_id)
        .in("session_id", ids.slice(i, i + 200));
    await db
      .from("events")
      .update({ purged_at: new Date().toISOString() })
      .eq("id", ev.id)
      .eq("organization_id", ev.organization_id);
    done.push(ev.id);
  }
  return Response.json({ purged: done });
}
