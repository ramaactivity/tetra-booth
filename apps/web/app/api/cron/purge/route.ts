import * as Sentry from "@sentry/nextjs";
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
  const failed: string[] = [];
  // Per event: satu event gagal (R2/Supabase) tidak menghentikan sisanya; purged_at hanya diisi kalau semua langkah
  // berhasil, jadi event gagal dicoba lagi besok. Error ke Sentry (audit 27 Nov: dulu diam & berhenti di event itu).
  for (const ev of due ?? []) {
    try {
      const ok = <T extends { error: unknown }>(r: T) => {
        if (r.error) throw r.error;
        return r;
      };
      await deleteObjects(await listKeys(`${ev.organization_id}/${ev.id}/`));
      const { data: sessions } = ok(
        await db
          .from("sessions")
          .select("id")
          .eq("event_id", ev.id)
          .eq("organization_id", ev.organization_id),
      );
      const ids = (sessions ?? []).map((s) => s.id);
      for (let i = 0; i < ids.length; i += 200)
        ok(
          await db
            .from("assets")
            .delete()
            .eq("organization_id", ev.organization_id)
            .in("session_id", ids.slice(i, i + 200)),
        );
      // Data pribadi tamu ikut dihapus bersama foto (UU PDP).
      ok(
        await db
          .from("leads")
          .delete()
          .eq("event_id", ev.id)
          .eq("organization_id", ev.organization_id),
      );
      ok(
        await db
          .from("events")
          .update({ purged_at: new Date().toISOString() })
          .eq("id", ev.id)
          .eq("organization_id", ev.organization_id),
      );
      done.push(ev.id);
    } catch (e) {
      failed.push(ev.id);
      console.error(`[purge] event ${ev.id} gagal:`, e);
      Sentry.captureException(e, { tags: { cron: "purge" }, extra: { eventId: ev.id } });
    }
  }
  return Response.json({ purged: done, failed }, { status: failed.length ? 500 : 200 });
}
