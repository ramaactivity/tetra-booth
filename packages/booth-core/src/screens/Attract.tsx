import { Button } from "@tetra/ui";
import { ArrowRight } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { createTapDetector } from "../crew/taps";
import { Logo } from "../ui";

export const START_GUARD_MS = 800;

// Kolom strip contoh di kanan: offset vertikal & warna lapisan belakang per strip (A1).
const UNDER = ["var(--peach)", "var(--sky)", "var(--lavender)", "var(--mint-soft)"];
const COLUMNS = [0, -180, -60];

function SampleStrip({ name, under }: { name: string; under: string }) {
  return (
    <div
      style={{ "--under": under } as CSSProperties}
      className="layered flex w-[220px] shrink-0 flex-col gap-2.5 rounded-2xl border-[2.5px] border-ink bg-white px-3.5 pt-3.5"
    >
      {[0, 1, 2].map((i) => (
        <div key={i} className="stripes h-[150px] rounded-lg" />
      ))}
      <div className="flex h-[52px] items-center justify-center truncate text-[15px] font-extrabold tracking-[-0.01em]">
        {name}
      </div>
    </div>
  );
}

export function Attract({
  eventName,
  date,
  onStart,
  onCrew,
}: {
  eventName: string;
  date: string;
  onStart: () => void;
  onCrew?: (() => void) | undefined;
}) {
  const tap = useRef(createTapDetector());
  // Tombol mulai baru aktif sebentar setelah layar muncul: sentuhan ganda dari layar QR ("Selesai") atau
  // input tertunda setelah reload tidak boleh langsung memulai sesi baru (catatan W-016).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), START_GUARD_MS);
    return () => clearTimeout(t);
  }, []);
  // Nama panjang tetap muat di kolom kiri.
  const size = eventName.length > 14 ? "text-[120px]" : "text-[176px]";
  return (
    <main className="relative h-full w-full overflow-hidden bg-paper">
      <div className="absolute -bottom-[260px] -left-[220px] size-[760px] rounded-full bg-mint-soft" />
      <div className="absolute -bottom-[160px] -left-[120px] size-[560px] rounded-full border-2 border-white" />
      <div className="absolute -bottom-[60px] -left-5 size-[360px] rounded-full border-2 border-white" />
      <div className="absolute -top-[120px] right-[560px] size-[280px] rounded-full bg-peach portrait:hidden" />

      {/* Kolom strip contoh, bergerak lambat (loop vertikal). */}
      <div className="absolute -top-[60px] -bottom-[60px] right-[110px] flex gap-11 portrait:hidden">
        {COLUMNS.map((offset, c) => (
          <div key={offset} style={{ marginTop: offset }} className="overflow-visible">
            <div
              style={{ animationDuration: `${90 + c * 20}s` }}
              className="flex animate-[drift_linear_infinite] flex-col gap-12 pb-12 motion-reduce:animate-none"
            >
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <SampleStrip key={i} name={eventName} under={UNDER[(c + i) % 4] as string} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="absolute top-20 left-24">
        <Logo />
      </div>
      {/* Pojok kanan atas tak terlihat: tap 5x dalam 3 detik → mode crew (FSD §1.3). */}
      <button
        type="button"
        aria-label="crew"
        data-testid="crew-hotspot"
        className="absolute top-6 right-6 size-[72px] rounded-[14px] border-[1.5px] border-dashed border-ink/[0.08]"
        onClick={() => tap.current(Date.now()) && onCrew?.()}
      />

      <div className="absolute inset-y-0 left-24 flex w-[860px] flex-col justify-center gap-9 portrait:right-24 portrait:w-auto">
        <h1
          className={`${size} max-w-[680px] leading-[0.92] font-extrabold tracking-[-0.05em] break-words`}
        >
          {eventName}
        </h1>
        <p className="font-mono text-[40px] text-text-3">{date}</p>
        <Button
          className="mt-7 h-[136px] w-[680px] justify-between! rounded-[28px] border-[3px]! pr-5 pl-[52px] text-[44px] tracking-[-0.02em] [--lb:3px] [--lx:10px]"
          onClick={() => ready && onStart()}
        >
          {copy.attract.cta}
          <span className="flex size-24 items-center justify-center rounded-full border-[3px] border-ink bg-mint">
            <ArrowRight size={44} strokeWidth={2.5} />
          </span>
        </Button>
      </div>
    </main>
  );
}
