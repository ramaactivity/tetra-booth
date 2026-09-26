import { Button } from "@tetra/ui";
import { ArrowRight } from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { createTapDetector } from "../crew/taps";
import type { BoothEvent } from "../event";
import { usePlatform } from "../PlatformContext";
import { Logo } from "../ui";

export const START_GUARD_MS = 800;
/** Tahan logo selama ini untuk membuka mode crew. */
export const LOGO_HOLD_MS = 2000;

/** Ukuran judul menurut panjang nama event, supaya kolom kiri muat di bawah logo (maks ±3 baris). */
function titleSize(name: string) {
  if (name.length <= 11) return "text-[176px]";
  if (name.length <= 18) return "text-[132px]";
  return "text-[100px]";
}

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
  tagline,
  date,
  theme,
  onStart,
  onCrew,
}: {
  eventName: string;
  tagline?: string | undefined;
  date: string;
  /** Layar awal per event (#102): warna/gambar latar, teks tombol, strip contoh. */
  theme?: BoothEvent["attract"];
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
  const size = titleSize(eventName);

  // Jalan lain ke mode crew selain 5 ketukan pojok (UX, masukan Rama): tahan logo 2 detik, atau Ctrl+Shift+M
  // di keyboard laptop. Hanya di layar ini, jadi sesi tamu tidak pernah terpotong.
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdStart = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = setTimeout(() => onCrew?.(), LOGO_HOLD_MS);
  };
  const holdEnd = () => {
    if (hold.current) clearTimeout(hold.current);
    hold.current = null;
  };
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current);
    },
    [],
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault();
        onCrew?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCrew]);

  // Petunjuk cara masuk crew hanya selama PIN belum dibuat (setup pertama).
  const { crew } = usePlatform();
  const [needsSetup, setNeedsSetup] = useState(false);
  useEffect(() => {
    crew.pinStatus().then(
      (s) => setNeedsSetup(!s.hasPin),
      () => {},
    );
  }, [crew]);

  return (
    <main
      className="relative h-full w-full overflow-hidden bg-paper"
      style={theme?.background ? { background: theme.background } : undefined}
    >
      {theme?.imageUrl ? (
        <img src={theme.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <div className="absolute -bottom-[260px] -left-[220px] size-[760px] rounded-full bg-mint-soft" />
          <div className="absolute -bottom-[160px] -left-[120px] size-[560px] rounded-full border-2 border-white" />
          <div className="absolute -bottom-[60px] -left-5 size-[360px] rounded-full border-2 border-white" />
          <div className="absolute -top-[120px] right-[560px] size-[280px] rounded-full bg-peach portrait:hidden" />
        </>
      )}

      {/* Kolom strip contoh, bergerak lambat (loop vertikal). */}
      <div
        hidden={theme?.samples === false}
        className="absolute -top-[60px] -bottom-[60px] right-[110px] flex gap-11 portrait:hidden"
      >
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

      <button
        type="button"
        aria-label="logo (tahan untuk mode crew)"
        data-testid="crew-logo"
        className="absolute top-20 left-24 select-none"
        onPointerDown={holdStart}
        onPointerUp={holdEnd}
        onPointerLeave={holdEnd}
        onPointerCancel={holdEnd}
        onContextMenu={(e) => e.preventDefault()}
      >
        <Logo />
      </button>
      {needsSetup && (
        <p className="absolute right-6 bottom-6 z-10 max-w-[760px] rounded-2xl border-2 border-dashed border-ink/40 bg-white px-5 py-3 text-right text-xl font-semibold text-text-3">
          {copy.attract.crewHint}
        </p>
      )}
      {/* Pojok kanan atas tak terlihat: tap 5x dalam 3 detik → mode crew (FSD §1.3). */}
      <button
        type="button"
        aria-label="crew"
        data-testid="crew-hotspot"
        className="absolute top-6 right-6 size-[72px] rounded-[14px] border-[1.5px] border-dashed border-ink/[0.08]"
        onClick={() => tap.current(Date.now()) && onCrew?.()}
      />

      {/* Kolom judul mulai di bawah logo (top 168 px) supaya tagline/judul panjang tidak menimpa logo. */}
      {/* Di atas gambar latar: kolom judul di kartu putih supaya tetap terbaca. */}
      <div
        className={`absolute top-[168px] bottom-16 left-24 flex w-[860px] flex-col justify-center gap-8 portrait:right-24 portrait:w-auto ${theme?.imageUrl ? "my-auto h-fit rounded-[40px] border-[3px] border-ink bg-white/92 p-14" : ""}`}
      >
        {tagline && (
          <span className="flex items-center gap-3.5 self-start rounded-full border-[2.5px] border-ink bg-white py-3 pr-[26px] pl-3.5 text-[26px] font-bold whitespace-nowrap">
            <span className="size-9 rounded-full border-2 border-ink bg-lavender" />
            {tagline}
          </span>
        )}
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
          {theme?.cta ?? copy.attract.cta}
          <span className="flex size-24 items-center justify-center rounded-full border-[3px] border-ink bg-mint">
            <ArrowRight size={44} strokeWidth={2.5} />
          </span>
        </Button>
      </div>
    </main>
  );
}
