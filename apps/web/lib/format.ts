/** Format tampilan admin (WIB). */
const tz = { timeZone: "Asia/Jakarta" } as const;

/** "5 dtk lalu" / "3 mnt lalu" / "terakhir 14.20" / "12 Okt 14.20". */
export function ago(ts: string | null, now = Date.now()): string {
  if (!ts) return "belum pernah online";
  const s = Math.round((now - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.max(s, 0)} dtk lalu`;
  if (s < 3600) return `${Math.floor(s / 60)} mnt lalu`;
  const d = new Date(ts);
  const time = new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    ...tz,
  }).format(d);
  if (s < 86_400) return `terakhir ${time}`;
  return `${new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...tz }).format(d)} ${time}`;
}

/** Heartbeat < 2 menit = online (heartbeat tiap 60 dtk, TSD §10). */
export const isOnline = (ts: string | null, now = Date.now()) =>
  !!ts && now - new Date(ts).getTime() < 2 * 60_000;
