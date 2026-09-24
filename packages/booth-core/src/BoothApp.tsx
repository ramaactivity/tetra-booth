import type { EventBundle } from "@tetra/shared";
import { useCallback, useEffect, useState } from "react";
import { CrewMode } from "./crew/CrewMode";
import { errText } from "./errors";
import { type BoothEvent, DEFAULT_EVENT, loadEvent } from "./event";
import { usePlatform } from "./PlatformContext";
import type { PrinterAlert } from "./platform";
import { SessionRunner } from "./SessionRunner";

/** Akar UI booth: event aktif (dari bundle lokal), mode crew, dan peringatan printer untuk crew. */
export function BoothApp({ guestBaseUrl, demo = false }: { guestBaseUrl: string; demo?: boolean }) {
  const p = usePlatform();
  const [bundles, setBundles] = useState<EventBundle[]>([]);
  const [event, setEvent] = useState<BoothEvent>(DEFAULT_EVENT);
  const [crewOpen, setCrewOpen] = useState(false);
  const [alert, setAlert] = useState<PrinterAlert>(null);

  const activate = useCallback(
    async (id: string | null, list: EventBundle[]) => {
      const b = list.find((x) => x.id === id);
      const next = b ? await loadEvent(b, p.events) : DEFAULT_EVENT;
      setEvent(next);
      console.info(`[event] aktif: ${next.id} (${next.name})`);
    },
    [p],
  );

  useEffect(() => {
    (async () => {
      const list = await p.events.list();
      setBundles(list);
      await activate(await p.events.active(), list);
    })().catch((e: unknown) => console.error(`[event] gagal memuat: ${errText(e)}`));
  }, [p, activate]);

  useEffect(() => {
    p.crew.printerAlert().then(setAlert, () => {});
    return p.crew.onPrinterAlert(setAlert);
  }, [p]);

  const select = (id: string) =>
    p.events
      .setActive(id)
      .then(() => activate(id, bundles))
      .catch((e: unknown) => console.error(`[event] gagal memilih ${id}: ${errText(e)}`));

  if (crewOpen) {
    return (
      <div className="h-screen w-screen">
        <CrewMode
          event={event}
          bundles={bundles}
          onSelectEvent={select}
          onClose={() => setCrewOpen(false)}
        />
      </div>
    );
  }
  return (
    <>
      <SessionRunner
        key={event.id}
        event={event}
        guestBaseUrl={guestBaseUrl}
        demo={demo}
        onCrew={() => setCrewOpen(true)}
      />
      {alert && (
        <p
          className="fixed right-4 bottom-3 flex items-center gap-2 text-xs text-muted"
          role="status"
          data-testid="printer-alert"
        >
          <span className="size-2 rounded-full bg-accent" />
          {alert.message}
        </p>
      )}
    </>
  );
}
