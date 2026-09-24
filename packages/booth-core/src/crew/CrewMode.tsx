import type { EventBundle } from "@tetra/shared";
import { useEffect, useState } from "react";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import { CameraCheck } from "./CameraCheck";
import { CrewMenu } from "./CrewMenu";
import { PairPad } from "./PairPad";
import { PinPad } from "./PinPad";

type View = "pin" | "create" | "menu" | "camera" | "change" | "pair";

export function CrewMode({
  event,
  bundles,
  onSelectEvent,
  onReloadEvents,
  onClose,
}: {
  event: BoothEvent;
  bundles: EventBundle[];
  onSelectEvent: (id: string) => void;
  onReloadEvents: () => Promise<void>;
  onClose: () => void;
}) {
  const { crew } = usePlatform();
  const [view, setView] = useState<View | null>(null);

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
          onDone={() => setView("menu")}
          onCancel={view === "change" ? () => setView("menu") : close}
        />
      );
    case "pair":
      return <PairPad onDone={() => setView("menu")} onCancel={() => setView("menu")} />;
    case "camera":
      return <CameraCheck onBack={() => setView("menu")} />;
    case "menu":
      return (
        <CrewMenu
          event={event}
          bundles={bundles}
          activeId={event.id}
          onSelectEvent={onSelectEvent}
          onReloadEvents={onReloadEvents}
          onCameraCheck={() => setView("camera")}
          onChangePin={() => setView("change")}
          onPair={() => setView("pair")}
          onClose={close}
        />
      );
  }
}
