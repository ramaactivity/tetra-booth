import type { EventBundle } from "@tetra/shared";
import { Button } from "@tetra/ui";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import type { CrewStatus, FailedPrint } from "../platform";
import { testPrint } from "./testPrint";

const PAPER_LOW = 30;
const DEFAULT_ROLL = 700;

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded border border-line bg-surface p-6">
      <h2 className="text-sm font-medium uppercase tracking-label text-muted">{title}</h2>
      {children}
    </section>
  );
}

export function CrewMenu({
  event,
  bundles,
  activeId,
  onSelectEvent,
  onCameraCheck,
  onChangePin,
  onClose,
}: {
  event: BoothEvent;
  bundles: EventBundle[];
  activeId: string;
  onSelectEvent: (id: string) => void;
  onCameraCheck: () => void;
  onChangePin: () => void;
  onClose: () => void;
}) {
  const p = usePlatform();
  const [status, setStatus] = useState<CrewStatus>();
  const [failed, setFailed] = useState<FailedPrint[]>([]);
  const [roll, setRoll] = useState<string | null>(null);
  const [note, setNote] = useState<string>();

  const refresh = useCallback(async () => {
    try {
      const [s, f] = await Promise.all([p.crew.status(), p.crew.failedPrints()]);
      setStatus({ ...s, online: s.online && navigator.onLine });
      setFailed(f);
    } catch (e) {
      setNote(errText(e));
    }
  }, [p]);
  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh]);

  const act = (fn: () => Promise<unknown>, done?: string) => () =>
    fn()
      .then(() => {
        if (done) setNote(done);
        return refresh();
      })
      .catch((e: unknown) => setNote(errText(e)));

  const row =
    "flex min-h-16 items-center justify-between gap-4 border-t border-line pt-3 first-of-type:border-0 first-of-type:pt-0";
  return (
    <main className="h-full w-full overflow-y-auto bg-bg p-10 text-fg portrait:p-6">
      <header className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight">{copy.crew.title}</h1>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose}>
            {copy.crew.back}
          </Button>
          <Button variant="secondary" onClick={act(() => p.crew.exit())}>
            {copy.crew.exit}
          </Button>
        </div>
      </header>
      {note && (
        <p className="mb-6 text-sm text-accent" role="status">
          {note}
        </p>
      )}
      <div className="grid grid-cols-2 gap-6 portrait:grid-cols-1">
        <Card title={copy.crew.status}>
          {status ? (
            <ul className="flex flex-col gap-2 text-lg">
              <li>{status.online ? copy.crew.online : copy.crew.offline}</li>
              <li>{copy.crew.uploads(status.uploadPending)}</li>
              <li>{copy.crew.service(status.cameraService)}</li>
              <li>
                {copy.crew.printer(
                  `${status.printer.status}${status.printer.message ? ` · ${status.printer.message}` : ""}`,
                )}
              </li>
            </ul>
          ) : (
            <p className="text-muted">…</p>
          )}
        </Card>

        <Card title={copy.crew.events}>
          {[{ id: "local", name: copy.crew.defaultEvent, date: "" }, ...bundles].map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelectEvent(b.id)}
              className={`min-h-16 rounded border px-4 text-left text-lg ${b.id === activeId ? "border-accent border-2" : "border-line"}`}
            >
              {b.name} {b.date && <span className="text-sm text-muted">· {b.date}</span>}
            </button>
          ))}
        </Card>

        <Card title={copy.crew.printing}>
          {status && (
            <p className={`text-lg ${status.paper.remaining <= PAPER_LOW ? "text-accent" : ""}`}>
              {copy.crew.paper(status.paper.remaining, status.paper.capacity)}
              {status.paper.remaining <= PAPER_LOW && ` · ${copy.crew.paperLow}`}
            </p>
          )}
          {roll === null ? (
            <div className="flex flex-wrap gap-3">
              <Button
                variant="secondary"
                onClick={() => setRoll(String(status?.paper.capacity ?? DEFAULT_ROLL))}
              >
                {copy.crew.newRoll}
              </Button>
              <Button variant="secondary" onClick={act(() => testPrint(p, event), copy.crew.sent)}>
                {copy.crew.testPrint}
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-3 text-sm text-muted">
                {copy.crew.rollSize}
                <input
                  inputMode="numeric"
                  value={roll}
                  onChange={(e) => setRoll(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  className="min-h-16 w-28 rounded border border-line px-3 text-lg text-fg"
                />
              </label>
              <Button
                onClick={act(async () => {
                  await p.crew.resetPaper(Number(roll));
                  setRoll(null);
                })}
              >
                {copy.crew.save}
              </Button>
            </div>
          )}
          <h3 className="mt-2 text-sm font-medium uppercase tracking-label text-muted">
            {copy.crew.failedPrints}
          </h3>
          {failed.length === 0 ? (
            <p className="text-muted">{copy.crew.none}</p>
          ) : (
            failed.map((f) => (
              <div key={f.id} className={row}>
                <span className="text-sm">
                  {new Date(f.createdAt).toLocaleTimeString("id-ID")} · {f.copies}× · {f.error}
                </span>
                <Button
                  variant="secondary"
                  onClick={act(() => p.crew.reprint(f.id), copy.crew.sent)}
                >
                  {copy.crew.reprint}
                </Button>
              </div>
            ))
          )}
        </Card>

        <Card title={copy.crew.camera}>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onCameraCheck}>
              {copy.crew.checkCamera}
            </Button>
            <Button variant="secondary" onClick={onChangePin}>
              {copy.crew.changePin}
            </Button>
          </div>
        </Card>
      </div>
    </main>
  );
}
