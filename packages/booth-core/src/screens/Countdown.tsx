import { useEffect, useRef, useState } from "react";
import { copy } from "../copy";
import { usePlatform } from "../PlatformContext";
import { type Cue, play } from "../prompts";
import type { Photo } from "../session";
import { beep } from "../sound";
import { Done, Steps } from "../ui";
import { LIVE_WAIT_MS, liveMissed, waitsForLive } from "./LiveView";

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
  live = true,
  belowTimer = false,
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
  /** Live view sudah menampilkan frame. Angka baru jalan setelahnya (maks. LIVE_WAIT_MS): EVF DSLR dingin ±1,6 s. */
  live?: boolean;
  /** Pil sisa waktu photobox ada di pojok kanan atas: angka turun ke bawahnya. */
  belowTimer?: boolean;
}) {
  const { camera } = usePlatform();
  const [waited, setWaited] = useState(() => !waitsForLive(camera));
  // biome-ignore lint/correctness/useExhaustiveDependencies: sekali per countdown (komponen di-key per foto)
  useEffect(() => {
    if (waited) return;
    const t = setTimeout(() => {
      liveMissed(camera);
      setWaited(true);
    }, LIVE_WAIT_MS);
    return () => clearTimeout(t);
  }, []);
  const ready = live || waited;
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
    if (!go || !ready) return;
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
  }, [left, go, ready, sound]);

  return (
    <div className="absolute inset-0">
      <ShotProgress index={index} total={photos.length} />
      <Thumbs photos={photos} index={index} />
      {prompt && (
        // Bawah tengah, bukan di area wajah (masukan crew DSO): wajah tamu umumnya di sepertiga atas-tengah.
        <p className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-[tick_300ms_ease-out] rounded-[22px] border-[2.5px] border-ink bg-butter/85 px-9 py-3.5 text-[40px] leading-none font-extrabold tracking-[-0.02em] whitespace-nowrap">
          {prompt}
        </p>
      )}
      {!ready && (
        <p className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-[enter_250ms_ease-out_400ms_both] rounded-full bg-ink/70 px-8 py-3.5 text-[28px] font-bold whitespace-nowrap text-white">
          {copy.countdown.preparing}
        </p>
      )}
      {/* Pojok kanan atas, semi-transparan: tidak menutupi wajah tamu di live view (masukan crew DSO). */}
      {go && ready && left > 0 && (
        <div
          data-testid="countdown-number"
          className={`absolute right-10 flex size-[190px] ${belowTimer ? "top-[150px]" : "top-10"} items-center justify-center rounded-full border-[3px] border-ink/80 bg-white/70`}
        >
          <span
            key={left}
            className="animate-[tick_300ms_ease-out] text-[130px] leading-none font-extrabold tracking-[-0.05em]"
          >
            {left}
          </span>
        </div>
      )}
    </div>
  );
}
