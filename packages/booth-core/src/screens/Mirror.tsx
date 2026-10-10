import { Button } from "@tetra/ui";
import { Pause, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { copy } from "../copy";

const t = copy.mirror;

/**
 * "Ngaca dulu" (#254, permintaan tamu Rafi & Dinda): live view penuh sebelum foto pertama supaya tamu merapikan
 * baju & gaya, lalu tekan Mulai. Mulai sendiri setelah `seconds` supaya booth tidak tertahan.
 */
export function Mirror({
  seconds,
  live,
  onStart,
}: {
  seconds: number;
  live: boolean;
  onStart: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0">
      <p className="absolute top-10 left-1/2 -translate-x-1/2 rounded-[22px] border-[2.5px] border-ink bg-butter/90 px-10 py-4 text-center text-[44px] leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap">
        {t.title}
      </p>
      {!live && (
        <p className="absolute top-36 left-1/2 -translate-x-1/2 rounded-full bg-ink/70 px-8 py-3 text-[26px] font-bold whitespace-nowrap text-white">
          {copy.countdown.preparing}
        </p>
      )}
      <div className="absolute bottom-12 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3">
        <Button className="h-[112px] w-[560px] rounded-3xl text-[36px]" onClick={onStart}>
          <Play size={34} strokeWidth={2.5} fill="currentColor" />
          {t.start}
        </Button>
        <span className="rounded-full bg-ink/70 px-6 py-2 text-[22px] font-bold text-white">
          {t.auto(left)}
        </span>
      </div>
    </div>
  );
}

/** "Tunggu dulu" di hitung mundur & cek foto (#254): tamu belum siap ganti gaya. */
export function PauseControl({
  paused,
  onPause,
  onResume,
}: {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
}) {
  if (!paused)
    return (
      <Button
        variant="plain"
        className="absolute bottom-12 left-10 z-20 h-[88px] rounded-[22px] bg-white/85! px-7 text-[26px]"
        onClick={onPause}
      >
        <Pause size={26} strokeWidth={2.5} fill="currentColor" />
        {t.pause}
      </Button>
    );
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-6 bg-ink/45">
      <p className="rounded-[22px] border-[2.5px] border-ink bg-white px-10 py-5 text-center text-[42px] leading-tight font-extrabold">
        {t.paused}
        <span className="mt-1 block text-[24px] font-semibold text-text-2">{t.pausedSub}</span>
      </p>
      <Button className="h-[112px] w-[520px] rounded-3xl text-[36px]" onClick={onResume}>
        <Play size={34} strokeWidth={2.5} fill="currentColor" />
        {t.resume}
      </Button>
    </div>
  );
}
