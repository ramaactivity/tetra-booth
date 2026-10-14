import type { UploadSessionRow } from "./db";

export type UploadEventSummary = {
  eventId: string;
  sessions: number;
  sentSessions: number;
  files: number;
  sentFiles: number;
};

/** Ringkasan per event dari status per sesi (#271): sesi "terkirim" = semua filenya terunggah. */
export function summarizeUploads(rows: UploadSessionRow[]): UploadEventSummary[] {
  const by = new Map<string, UploadEventSummary>();
  for (const r of rows) {
    const e = by.get(r.eventId) ?? {
      eventId: r.eventId,
      sessions: 0,
      sentSessions: 0,
      files: 0,
      sentFiles: 0,
    };
    e.sessions++;
    if (r.sent >= r.files) e.sentSessions++;
    e.files += r.files;
    e.sentFiles += r.sent;
    by.set(r.eventId, e);
  }
  return [...by.values()];
}

/** Field heartbeat `uploadsByEvent`: hanya event yang masih punya sesi belum terkirim. */
export const pendingByEvent = (rows: UploadSessionRow[]) =>
  summarizeUploads(rows)
    .filter((e) => e.sentSessions < e.sessions)
    .slice(0, 50)
    .map((e) => ({
      eventId: e.eventId,
      sessions: e.sessions - e.sentSessions,
      files: e.files - e.sentFiles,
    }));
