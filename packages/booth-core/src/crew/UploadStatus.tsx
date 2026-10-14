import { Button } from "@tetra/ui";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { usePlatform } from "../PlatformContext";
import type { UploadEvent } from "../platform";
import { btn, dot, Panel, Pill, Row } from "./parts";

const c = copy.crew;
const SHOWN = 60;

/** Error upload mentah ("/api/booth/sessions: server 404", "fetch failed") → alasan yang dimengerti crew. */
export function uploadReason(raw: string): string {
  const e = c.uploadErr;
  if (/server 401|server 403/.test(raw)) return e.revoked;
  if (/server 404/.test(raw)) return e.gone;
  if (/server 5\d\d/.test(raw)) return e.server;
  if (/fetch failed|offline|ENOTFOUND|ECONN|ETIMEDOUT|network/i.test(raw)) return e.offline;
  return e.other;
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

/**
 * Offline-first (#271, acara CIMB di lokasi susah sinyal): per event cloud berapa sesi sudah terkirim, dan per sesi
 * file mana yang masih di laptop. Diperbarui tiap 5 dtk selama halaman terbuka.
 */
export function UploadStatus({ activeId }: { activeId: string }) {
  const p = usePlatform();
  const [events, setEvents] = useState<UploadEvent[]>();
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      p.crew
        .uploads()
        .then((e) => live && setEvents(e))
        .catch(() => {});
    void load();
    const t = setInterval(load, 5000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [p]);
  if (!events) return null;
  const pending = (e: UploadEvent) => e.sentSessions < e.sessions;
  const sorted = [...events].sort(
    (a, b) =>
      Number(b.eventId === activeId) - Number(a.eventId === activeId) ||
      Number(pending(b)) - Number(pending(a)),
  );
  return (
    <Panel title={c.uploads.title} hint={c.uploads.hint} testId="upload-status">
      {sorted.length === 0 && <p className="text-lg text-text-2">{c.uploads.empty}</p>}
      {sorted.map((e) => (
        <div
          key={e.eventId}
          data-testid={`upload-event-${e.eventId}`}
          className="flex flex-col gap-3"
        >
          <Row
            label={
              <span className="flex flex-wrap items-center gap-3">
                {e.name}
                <Pill tone={pending(e) ? "peach" : "mint"}>
                  {dot}
                  {pending(e) ? c.uploads.notYet : c.uploads.allSent}
                </Pill>
              </span>
            }
            hint={c.uploads.summary(e.sentSessions, e.sessions, e.files - e.sentFiles)}
          >
            <Button
              variant="secondary"
              className={btn}
              onClick={() => setOpen(open === e.eventId ? null : e.eventId)}
            >
              {open === e.eventId ? c.uploads.hide : c.uploads.show}
            </Button>
          </Row>
          {open === e.eventId && (
            <ul className="flex flex-col divide-y-2 divide-dashed divide-line-soft rounded-[18px] border-2 border-ink px-5">
              {e.list.slice(0, SHOWN).map((s) => {
                const done = s.sent >= s.files;
                return (
                  <li
                    key={s.id}
                    data-testid="upload-session"
                    className="flex items-center justify-between gap-4 py-3 text-lg"
                  >
                    <span className="min-w-0">
                      <span className="font-bold">{when(s.completedAt)}</span>
                      <span className="ml-3 font-mono text-text-2">{s.id}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono">{c.uploads.files(s.sent, s.files)}</span>
                      <Pill tone={done ? "mint" : s.error ? "coral" : "butter"}>
                        {done ? c.uploads.sent : s.error ? uploadReason(s.error) : c.uploads.queued}
                      </Pill>
                    </span>
                  </li>
                );
              })}
              {e.list.length > SHOWN && (
                <li className="py-3 text-lg text-text-2">
                  {c.uploads.more(e.list.length - SHOWN)}
                </li>
              )}
            </ul>
          )}
        </div>
      ))}
    </Panel>
  );
}
