import { Button } from "@tetra/ui";
import { useRef } from "react";
import { copy } from "../copy";
import { createTapDetector } from "../crew/taps";

export function Attract({
  eventName,
  onStart,
  onCrew,
}: {
  eventName: string;
  onStart: () => void;
  onCrew?: (() => void) | undefined;
}) {
  const tap = useRef(createTapDetector());
  return (
    <main className="relative flex h-full w-full flex-col items-center justify-center gap-16 bg-bg p-16 text-fg">
      {/* Pojok kanan atas tak terlihat: tap 5x dalam 3 detik → mode crew (FSD §1.3). */}
      <button
        type="button"
        aria-label="crew"
        data-testid="crew-hotspot"
        className="absolute top-0 right-0 size-24 opacity-0"
        onClick={() => tap.current(Date.now()) && onCrew?.()}
      />
      <h1 className="text-center font-display text-7xl font-medium tracking-tight portrait:text-5xl">
        {eventName}
      </h1>
      <Button size="booth" onClick={onStart}>
        {copy.attract.cta}
      </Button>
    </main>
  );
}
