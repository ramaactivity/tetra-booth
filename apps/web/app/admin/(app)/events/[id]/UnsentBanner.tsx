import { CloudOff } from "lucide-react";
import { unsentByEvent } from "@/lib/booth-health";
import { ago } from "@/lib/format";
import type { requireMember } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof requireMember>>["db"];

/**
 * Offline-first (#271): sesi event ini yang masih tersimpan di laptop booth (belum pernah / belum lengkap terkirim),
 * dari heartbeat tiap laptop. "Terkirim lengkap" di bawah hanya menghitung sesi yang sudah sampai cloud.
 */
export async function UnsentBanner({
  db,
  orgId,
  eventId,
}: {
  db: Db;
  orgId: string;
  eventId: string;
}) {
  const { data: devices } = await db
    .from("devices")
    .select("name, short_code, last_seen_at, status")
    .eq("organization_id", orgId)
    .is("revoked_at", null);
  const list = unsentByEvent(devices ?? []).get(eventId);
  if (!list?.length) return null;
  const now = Date.now();
  return (
    <section
      data-testid="unsent-banner"
      className="mt-5 flex items-start gap-3 rounded-2xl border-[1.5px] border-ink bg-peach px-5 py-4"
    >
      <CloudOff aria-hidden className="mt-0.5 size-5 flex-none" strokeWidth={2} />
      <div className="min-w-0 text-sm">
        <p className="font-extrabold">Belum semua foto event ini terkirim ke cloud</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {list.map((u) => (
            <li key={u.device}>
              <b>{u.device}</b>: {u.sessions} sesi ({u.files} file) masih di laptop
              {u.online ? ", sedang dikirim" : `, laptop offline sejak ${ago(u.lastSeen, now)}`}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-text-2">
          Terkirim sendiri begitu laptop dapat internet. Jangan hapus aplikasi atau folder event di
          laptop itu dulu.
        </p>
      </div>
    </section>
  );
}
