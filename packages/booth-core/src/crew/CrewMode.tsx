import type { EventBundle } from "@tetra/shared";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { eventDesigns } from "../designEdit";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import { slotAspect } from "../screens/LiveView";
import { StartScreen } from "../screens/StartScreen";
import { CameraCheck } from "./CameraCheck";
import { CrewMenu } from "./CrewMenu";
import { DesignEditor } from "./DesignEditor";
import { PairPad } from "./PairPad";
import { PinPad } from "./PinPad";

type View = "pin" | "create" | "menu" | "camera" | "change" | "pair" | "start";

export function CrewMode({
  event,
  bundles,
  onSelectEvent,
  onReloadEvents,
  onClose,
  openAdmin = false,
}: {
  event: BoothEvent;
  bundles: EventBundle[];
  onSelectEvent: (id: string) => void;
  onReloadEvents: () => Promise<void>;
  onClose: () => void;
  /** Dibuka dari tombol Dashboard Admin di layar awal: setelah PIN benar, langsung buka browser. */
  openAdmin?: boolean;
}) {
  const { crew } = usePlatform();
  const [view, setView] = useState<View | null>(null);
  // Editor desain di booth (#131): layout.id yang sedang diedit + waktu simpan terakhirnya.
  const [editing, setEditing] = useState<{ id: string; savedAt?: string } | null>(null);
  const bundle = bundles.find((b) => b.id === event.id);
  const design = editing && eventDesigns(event).find((d) => d.id === editing.id);

  useEffect(() => {
    crew
      .pinStatus()
      .then((s) => setView(s.hasPin ? "pin" : "create"))
      .catch(() => setView("pin"));
  }, [crew]);

  const close = () => {
    void crew.lock();
    onClose();
  };

  switch (view) {
    case null:
      return null;
    case "pin":
    case "create":
    case "change":
      return (
        <PinPad
          key={view}
          create={view !== "pin"}
          onDone={() => {
            if (openAdmin && view === "pin") void crew.openAdmin().catch(() => {});
            setView("menu");
          }}
          onCancel={view === "change" ? () => setView("menu") : close}
        />
      );
    case "pair":
      return <PairPad onDone={() => setView("menu")} onCancel={() => setView("menu")} />;
    case "camera":
      return (
        <CameraCheck
          eventId={event.id}
          slot={slotAspect(event.layout.slots[0])}
          onBack={() => setView("menu")}
        />
      );
    case "start":
      return (
        <StartScreen
          bundles={bundles}
          activeId={event.id}
          onPick={(id) => {
            // Kembali ke checklist crew (langkah berikutnya: cek kamera & printer), bukan langsung ke tamu.
            onSelectEvent(id);
            setView("menu");
          }}
          onSync={async () => {
            const n = await crew.syncEvents();
            await onReloadEvents();
            return n;
          }}
          onCrew={() => setView("menu")}
          onAdmin={() => void crew.openAdmin().catch(() => {})}
          onEditEvent={(id) => void crew.openAdmin(`/admin/events/${id}/settings`).catch(() => {})}
          crewLabel={copy.start.backToCrew}
        />
      );
    case "menu":
      return (
        <>
          <CrewMenu
            event={event}
            onChangeEvent={() => setView("start")}
            onEditDesign={(id) =>
              crew.designs(event.id).then(
                (m) => setEditing({ id, ...(m[id] && { savedAt: m[id] }) }),
                () => setEditing({ id }),
              )
            }
            onReloadEvents={onReloadEvents}
            onCameraCheck={() => setView("camera")}
            onChangePin={() => setView("change")}
            onPair={() => setView("pair")}
            onClose={close}
          />
          {bundle && design && (
            <DesignEditor
              key={design.id}
              bundle={bundle}
              design={design}
              savedAt={editing?.savedAt}
              onBack={(saved) => {
                setEditing(null);
                if (saved) void onReloadEvents();
              }}
            />
          )}
        </>
      );
  }
}
