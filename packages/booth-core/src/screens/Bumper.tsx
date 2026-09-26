import { useEffect, useRef } from "react";
import { fadeOutSound, play } from "../prompts";

/** Batas aman: video macet / tidak jalan → tetap lanjut ke layar awal. */
const MAX_MS = 10_000;
/** Bumper memudar ke layar awal (latar sama-sama kertas), bukan hilang mendadak. */
export const BUMPER_FADE_MS = 450;

/**
 * Video bumper Tetra (#105) di atas layar awal. Selesai / gagal / disentuh → `onEnd` (layar awal mulai dibangun),
 * bumper memudar `BUMPER_FADE_MS` lalu `onDone`. Suara `bumper` mulai bersamaan dengan frame pertama video.
 */
export function Bumper({
  sound,
  leaving,
  onEnd,
  onDone,
}: {
  sound: boolean;
  leaving: boolean;
  onEnd: () => void;
  onDone: () => void;
}) {
  const end = useRef(onEnd);
  end.current = onEnd;
  const done = useRef(onDone);
  done.current = onDone;
  const started = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => end.current(), MAX_MS);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => done.current(), BUMPER_FADE_MS);
    return () => clearTimeout(t);
  }, [leaving]);
  return (
    <button
      type="button"
      aria-label="Lewati bumper"
      data-testid="bumper"
      style={{ transitionDuration: `${BUMPER_FADE_MS}ms` }}
      className={`absolute inset-0 z-40 bg-paper transition-opacity ease-out ${leaving ? "pointer-events-none opacity-0" : ""}`}
      onClick={() => {
        fadeOutSound();
        end.current();
      }}
    >
      <video
        src="bumper.mp4"
        autoPlay
        muted
        playsInline
        onPlaying={() => {
          if (sound && !started.current) void play("bumper", 8000);
          started.current = true;
        }}
        onEnded={() => end.current()}
        onError={() => end.current()}
        className="h-full w-full object-cover"
      />
    </button>
  );
}
