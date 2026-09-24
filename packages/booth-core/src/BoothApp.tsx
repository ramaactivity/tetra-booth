import type { EventBundle } from "@tetra/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CrewMode } from "./crew/CrewMode";
import { errText } from "./errors";
import { type BoothEvent, DEFAULT_EVENT, loadEvent } from "./event";
import { usePlatform } from "./PlatformContext";
import type { PrinterAlert } from "./platform";
import { SessionRunner } from "./SessionRunner";
import { Stage } from "./ui";

/** Akar UI booth: event aktif (dari bundle lokal), mode crew, dan peringatan printer untuk crew. */
export function BoothApp({
  guestBaseUrl,
  demo = false,
  fast = false,
  kiosk = false,
}: {
  guestBaseUrl: string;
  demo?: boolean;
  /** Demo dipercepat untuk stress test (M8): countdown 1 s, jeda antar foto 0,2 s. */
  fast?: boolean;
  /** Kiosk (M5): kursor disembunyikan untuk tamu; mode crew tetap menampilkan kursor. */
  kiosk?: boolean;
}) {
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

  // Muat ulang daftar bundle + event aktif: saat mulai, dan setelah sync dari mode crew (bukan di tengah sesi).
  const reload = useCallback(async () => {
    const list = await p.events.list();
    setBundles(list);
    await activate(await p.events.active(), list);
  }, [p, activate]);
  useEffect(() => {
    reload().catch((e: unknown) => console.error(`[event] gagal memuat: ${errText(e)}`));
  }, [reload]);

  useEffect(() => {
    p.crew.printerAlert().then(setAlert, () => {});
    return p.crew.onPrinterAlert(setAlert);
  }, [p]);

  // Objek event harus stabil antar render: efek SessionRunner (compose, selesai sesi) bergantung padanya.
  const runEvent = useMemo(
    () =>
      fast
        ? { ...event, settings: { ...event.settings, countdownSec: 1, shotDelaySec: 0.2 } }
        : event,
    [event, fast],
  );

  const select = (id: string) =>
    p.events
      .setActive(id)
      .then(() => activate(id, bundles))
      .catch((e: unknown) => console.error(`[event] gagal memilih ${id}: ${errText(e)}`));

  if (crewOpen) {
    return (
      <Stage>
        <CrewMode
          event={event}
          bundles={bundles}
          onSelectEvent={select}
          onReloadEvents={reload}
          onClose={() => setCrewOpen(false)}
        />
      </Stage>
    );
  }
  return (
    <div className={kiosk ? "cursor-none [&_*]:cursor-none" : undefined}>
      <Stage>
        <SessionRunner
          key={event.id}
          event={runEvent}
          guestBaseUrl={guestBaseUrl}
          demo={demo}
          fast={fast}
          onCrew={() => setCrewOpen(true)}
        />
        {alert && (
          <p
            className="absolute bottom-5 left-6 flex items-center gap-2.5 rounded-full border-2 border-ink bg-white px-4 py-1.5 text-xl font-semibold"
            role="status"
            data-testid="printer-alert"
          >
            <span className="size-2.5 rounded-full border-[1.5px] border-ink bg-coral-strong" />
            {alert.message}
          </p>
        )}
      </Stage>
    </div>
  );
}
