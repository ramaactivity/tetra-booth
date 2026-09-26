import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { type Cue, play } from "../prompts";
import type { Photo } from "../session";
import { beep } from "../sound";
import { Done, Steps } from "../ui";

/** Pill progres "Foto n dari N" + stepper, dipakai di countdown dan preview. */
export function ShotProgress({
  index,
  total,
  taken = false,
}: {
  index: number;
  total: number;
  /** Foto `index` sudah diambil (preview): langkahnya tampil ✓. */
  taken?: boolean;
}) {
  return (
    <div className="absolute top-10 left-1/2 flex -translate-x-1/2 items-center gap-[22px] rounded-full border-[2.5px] border-ink bg-white px-[30px] py-3.5 whitespace-nowrap">
      <span className="text-[26px] font-extrabold">
        {copy.countdown.progress(index + 1, total)}
      </span>
      <Steps total={total} current={taken ? index + 1 : index} />
    </div>
  );
}

/** Thumbnail samping: selesai = foto + ✓, aktif = butter, belum = putus-putus. */
function Thumbs({ photos, index }: { photos: (Photo | null)[]; index: number }) {
  const box = "flex h-[134px] w-[200px] items-center justify-center rounded-2xl border-ink";
  return (
    <div className="absolute top-1/2 left-11 flex -translate-y-1/2 flex-col gap-[18px] portrait:hidden">
      {photos.map((p, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: urutan slot tetap
          key={i}
          className={`${box} ${
            i === index
              ? "border-[3px] bg-butter text-2xl font-extrabold"
              : p
                ? "relative overflow-hidden border-[2.5px] bg-neutral"
                : "border-[2.5px] border-dashed bg-white/70 text-[22px] font-bold"
          }`}
        >
          {i !== index && p ? (
            <>
              <img src={p.url} alt="" className="h-full w-full object-cover" />
              <Done size={32} className="absolute top-2 left-2" />
            </>
          ) : (
            i + 1
          )}
        </div>
      ))}
    </div>
  );
}

/** Angka countdown dalam lingkaran putih berlapis mint, di atas live view (A5). Selesai → onDone. */
export function Countdown({
  seconds,
  index,
  photos,
  onDone,
  sound = false,
  prompt = "",
  cue = "foto-1",
}: {
  seconds: number;
  index: number;
  photos: (Photo | null)[];
  onDone: () => void;
  /** Suara: kalimat `cue` dulu (maks. 3,5 dtk), lalu angka 3-2-1 + jepret (file tidak ada = bunyi tik) (#102/#103). */
  sound?: boolean;
  /** Kalimat besar di atas hitung mundur, mis. "Gaya kedua, lebih seru!" (#103). */
  prompt?: string;
  /** Suara kalimat pembuka; null = tanpa suara kalimat (kalimat buatan event). */
  cue?: Cue | null;
}) {
  const [left, setLeft] = useState(seconds);
  // Dengan suara, angka baru jalan setelah kalimat pembuka selesai diucapkan (maks. 3 dtk).
  const [go, setGo] = useState(!sound);
  // biome-ignore lint/correctness/useExhaustiveDependencies: sekali per countdown (komponen di-key per foto)
  useEffect(() => {
    if (!sound) return;
    let live = true;
    if (!cue) {
      setGo(true);
      return;
    }
    void play(cue, 3500).then(() => live && setGo(true));
    return () => {
      live = false;
    };
  }, []);
  // Ref: induk bisa render ulang tiap detik (timer photobox); callback baru tidak boleh me-reset hitungan.
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    if (!go) return;
    if (sound) {
      const kind = left > 0 ? "tick" : "shutter";
      const voice: Cue = left > 0 && left <= 3 ? (String(left) as Cue) : "jepret";
      if (left > 3) beep(kind);
      else void play(voice, 1500).then((ok) => ok || beep(kind));
    }
    if (left <= 0) {
      done.current();
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, go, sound]);

  return (
    <div className="absolute inset-0">
      <ShotProgress index={index} total={photos.length} />
      <Thumbs photos={photos} index={index} />
      {prompt && (
        <p className="absolute top-40 left-1/2 -translate-x-1/2 animate-[tick_300ms_ease-out] rounded-[28px] border-[3px] border-ink bg-butter px-12 py-5 text-[64px] leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap">
          {prompt}
        </p>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        {go && left > 0 && (
          <div className="layered flex size-[340px] items-center justify-center rounded-full border-4 border-ink bg-white [--lb:4px] [--lx:14px] [--under:var(--mint)]">
            <span
              key={left}
              className="animate-[tick_300ms_ease-out] text-[230px] leading-none font-extrabold tracking-[-0.05em]"
            >
              {left}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
