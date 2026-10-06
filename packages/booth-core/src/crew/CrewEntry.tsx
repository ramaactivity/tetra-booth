import { useEffect, useRef } from "react";
import { createTapDetector } from "./taps";

type OnCrew = ((intent?: "exit") => void) | undefined;

/** Pojok kanan atas tak terlihat: tap 5× dalam 3 detik → mode crew (FSD §1.3). */
export function CrewHotspot({ onCrew }: { onCrew: OnCrew }) {
  const tap = useRef(createTapDetector());
  return (
    <button
      type="button"
      aria-label="crew"
      data-testid="crew-hotspot"
      className="absolute top-6 right-6 size-[72px] rounded-[14px] border-[1.5px] border-dashed border-ink/[0.08]"
      onClick={() => tap.current(Date.now()) && onCrew?.()}
    />
  );
}

/** Ctrl+Shift+M = mode crew; Ctrl+Shift+Q = Tutup Aplikasi lewat PIN crew (Alt+F4 diblokir di kiosk). */
export function useCrewKeys(onCrew: OnCrew) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k !== "m" && k !== "q") return;
      e.preventDefault();
      onCrew?.(k === "q" ? "exit" : undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCrew]);
}
