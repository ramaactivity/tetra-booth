import type { EventBundle } from "@tetra/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { copy } from "./copy";
import { CrewMode } from "./crew/CrewMode";
import { guestCursor } from "./cursorPref";
import { errText } from "./errors";
import { type BoothEvent, DEFAULT_EVENT, loadEvent, releaseEvent } from "./event";
import { usePlatform } from "./PlatformContext";
import type { PrinterAlert } from "./platform";
import { SessionRunner } from "./SessionRunner";
import { StartScreen } from "./screens/StartScreen";
import { Stage } from "./ui";

/** Akar UI booth: event aktif (dari bundle lokal), mode crew, dan peringatan printer untuk crew. */
export function BoothApp({
  guestBaseUrl,
  demo = false,
  fast = false,
  kiosk = false,
  startScreen = false,
  bumper = false,
}: {
  guestBaseUrl: string;
  demo?: boolean;
  /** Demo dipercepat untuk stress test (M8): countdown 1 s, jeda antar foto 0,2 s. */
  fast?: boolean;
  /** Kiosk (M5): kursor disembunyikan untuk tamu; mode crew tetap menampilkan kursor. */
  kiosk?: boolean;
  /** Layar awal pilih mode & event saat app dibuka manual (DECISIONS #86). */
  startScreen?: boolean;
  /** Putar bumper saat event dibuka (#105). */
  bumper?: boolean;
}) {
  const p = usePlatform();
  const [bundles, setBundles] = useState<EventBundle[]>([]);
  const [event, setEvent] = useState<BoothEvent>(DEFAULT_EVENT);
  const [crewOpen, setCrewOpen] = useState(false);
  const [start, setStart] = useState(startScreen);
  const [alert, setAlert] = useState<PrinterAlert>(null);
  // Tombol Dashboard Admin di layar awal: PIN crew dulu, lalu browser terbuka.
  const [adminIntent, setAdminIntent] = useState(false);
  const [exitIntent, setExitIntent] = useState(false);
  // Kursor di mode tamu: diatur crew (CrewMenu), dibaca ulang tiap mode crew ditutup.
  const [showCursor, setShowCursor] = useState(guestCursor.shown);
  // Notifikasi hasil update (berhasil / gagal dipasang) sekali setelah booth terbuka lagi (masukan Rama).
  const [toast, setToast] = useState<{ ok: boolean; text: string; ms?: number } | null>(null);
  // Ctrl+Shift+K di layar tamu: tampil/sembunyikan kursor tanpa masuk mode crew (masukan Rama).
  useEffect(() => {
    if (crewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "k")) return;
      e.preventDefault();
      const on = !guestCursor.shown();
      guestCursor.set(on);
      setShowCursor(on);
      setToast({ ok: true, text: on ? copy.crew.cursorShown : copy.crew.cursorHidden, ms: 2500 });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [crewOpen]);
  useEffect(() => {
    p.crew.updateResult().then(
      (r) =>
        r &&
        setToast({
          ok: r.ok,
          text: r.ok ? copy.crew.updateDone(r.to) : copy.crew.updateNotInstalled(r.to, r.now),
        }),
      () => {},
    );
  }, [p]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.ms ?? (toast.ok ? 10_000 : 30_000));
    return () => clearTimeout(t);
  }, [toast]);
  const notice = toast && (
    <button
      type="button"
      aria-live="polite"
      onClick={() => setToast(null)}
      className={`absolute top-6 left-1/2 z-50 max-w-[1400px] -translate-x-1/2 rounded-2xl border-[2.5px] border-ink px-7 py-4 text-2xl font-bold ${toast.ok ? "bg-mint" : "bg-coral-strong text-white"}`}
    >
      {toast.text}
    </button>
  );

  const activate = useCallback(
    async (id: string | null, list: EventBundle[]) => {
      const b = list.find((x) => x.id === id);
      const next = b ? await loadEvent(b, p.events) : DEFAULT_EVENT;
      setEvent((prev) => {
        if (prev && prev !== next) releaseEvent(prev);
        return next;
      });
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

  if (start && !crewOpen) {
    return (
      <Stage>
        <StartScreen
          bundles={bundles}
          activeId={event.id}
          onPick={(id) => {
            setStart(false);
            void select(id);
          }}
          onCrew={() => setCrewOpen(true)}
          onAdmin={() => {
            setAdminIntent(true);
            setCrewOpen(true);
          }}
        />
        {notice}
      </Stage>
    );
  }
  if (crewOpen) {
    return (
      <Stage>
        <CrewMode
          event={event}
          bundles={bundles}
          guestBaseUrl={guestBaseUrl}
          onSelectEvent={(id) => {
            // Event dipilih lewat layar pilih mode di mode crew → layar awal selesai.
            setStart(false);
            void select(id);
          }}
          onReloadEvents={reload}
          openAdmin={adminIntent}
          openExit={exitIntent}
          onClose={() => {
            setAdminIntent(false);
            setExitIntent(false);
            setShowCursor(guestCursor.shown());
            setCrewOpen(false);
          }}
        />
        {notice}
      </Stage>
    );
  }
  return (
    <div className={kiosk && !showCursor ? "cursor-none [&_*]:cursor-none" : undefined}>
      <Stage>
        <SessionRunner
          key={event.id}
          event={runEvent}
          guestBaseUrl={guestBaseUrl}
          demo={demo}
          fast={fast}
          bumper={bumper}
          onCrew={(intent) => {
            setExitIntent(intent === "exit");
            setCrewOpen(true);
          }}
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
        {notice}
      </Stage>
    </div>
  );
}
