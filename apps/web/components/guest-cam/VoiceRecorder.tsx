"use client";
import { GUEST_VOICE_MAX_SEC } from "@tetra/shared";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { firstName, Primary, Screen, Secondary, TopBar } from "./ui";

const t = copy.guestCam;
const BARS = 40;
type Take = {
  blob: Blob;
  url: string;
  type: "audio/webm" | "audio/mp4";
  secs: number;
  bars: number[];
};
const mmss = (s: number) =>
  `00:${String(Math.min(99, Math.max(0, Math.floor(s)))).padStart(2, "0")}`;

/** Gulungan kaset: berputar saat merekam/memutar. */
function Reel({ spin }: { spin: boolean }) {
  return (
    <svg
      width="58"
      height="58"
      viewBox="0 0 58 58"
      aria-hidden
      className={spin ? "motion-safe:animate-spin motion-safe:[animation-duration:2.4s]" : ""}
    >
      <circle cx="29" cy="29" r="27" fill="#F8F7F4" />
      <circle cx="29" cy="29" r="9" fill="#1D1D1B" />
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <rect
          key={a}
          x="27"
          y="4"
          width="4"
          height="12"
          rx="2"
          fill="#1D1D1B"
          transform={`rotate(${a} 29 29)`}
        />
      ))}
    </svg>
  );
}

/** Kaset (ucapan suara gaya voice tape, #209): label nama tamu + acara, jendela pita, gulungan. */
function Cassette({
  spin,
  from,
  to,
  done,
}: {
  spin: boolean;
  from: string;
  to: string;
  done?: boolean;
}) {
  return (
    <div className="relative mx-auto w-full max-w-[340px] rounded-[22px] bg-peach p-3.5 text-ink shadow-[0_18px_40px_rgba(0,0,0,.45)]">
      <div className="rounded-xl bg-paper px-3.5 pt-2 pb-3">
        <div className="flex items-center justify-between font-mono text-[10px] font-bold tracking-widest">
          <span>SIDE A</span>
          <span>{GUEST_VOICE_MAX_SEC}s</span>
        </div>
        <div className="mt-1 truncate text-lg leading-tight font-extrabold">{from}</div>
        <div className="truncate text-[13px] text-text-2">untuk {to}</div>
        <div className="mt-2.5 flex items-center justify-between rounded-full bg-ink px-4 py-2">
          <Reel spin={spin} />
          <div className="mx-2 h-6 flex-1 rounded-md bg-[#4a2f1a]" />
          <Reel spin={spin} />
        </div>
      </div>
      <div className="mx-auto mt-2.5 flex h-5 w-1/2 items-center justify-around rounded-t-lg bg-ink/80">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="size-1.5 rounded-full bg-peach" />
        ))}
      </div>
      {done && (
        <span className="absolute -top-3 -right-2 rotate-6 rounded-lg bg-green px-3 py-1 text-sm font-extrabold text-white">
          ✓ Terkirim
        </span>
      )}
    </div>
  );
}

function Wave({ bars, filled, played = 0 }: { bars: number[]; filled: number; played?: number }) {
  return (
    <div className="flex h-14 items-center gap-[3px]" aria-hidden>
      {Array.from({ length: BARS }, (_, n) => n).map((i) => (
        <span
          key={i}
          className={`flex-1 rounded-full ${i < played ? "bg-butter" : i < filled ? "bg-paper" : "bg-paper/20"}`}
          style={{ height: i < filled ? Math.max(6, Math.round((bars[i] ?? 0.2) * 52)) : 4 }}
        />
      ))}
    </div>
  );
}

/**
 * Ucapan suara (#209, gaya kaset): rekam (maks 30 dtk, berhenti sendiri), dengar ulang, kirim (satu per tamu).
 * MediaRecorder webm/opus, mp4 di iOS; amplitudo waveform dari AnalyserNode.
 */
export function VoiceRecorder({
  info,
  name,
  sent,
  onSend,
  onClose,
}: {
  info: GuestInfo;
  name: string;
  sent: boolean;
  onSend: (blob: Blob, type: "audio/webm" | "audio/mp4") => Promise<void>;
  onClose: () => void;
}) {
  const rec = useRef<MediaRecorder | null>(null);
  const bars = useRef<number[]>([]);
  const audio = useRef<HTMLAudioElement>(null);
  const [secs, setSecs] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [take, setTake] = useState<Take | null>(null);
  const [state, setState] = useState<"idle" | "rec" | "review" | "sending">("idle");
  const [denied, setDenied] = useState(false);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const from = firstName(name);

  useEffect(
    () => () => {
      for (const tr of rec.current?.stream.getTracks() ?? []) tr.stop();
    },
    [],
  );

  const start = async () => {
    setDenied(false);
    audio.current?.pause();
    setPlaying(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : {},
      );
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const chunks: Blob[] = [];
      const t0 = Date.now();
      bars.current = [];
      let peak = 0;
      const tick = setInterval(() => {
        an.getByteTimeDomainData(buf);
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
        const s = (Date.now() - t0) / 1000;
        if (bars.current.length < Math.floor((s / GUEST_VOICE_MAX_SEC) * BARS)) {
          bars.current.push(Math.min(1, 0.15 + peak * 1.6));
          peak = 0;
          setLive([...bars.current]);
        }
        setSecs(s);
        if (s >= GUEST_VOICE_MAX_SEC && mr.state === "recording") mr.stop();
      }, 100);
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        clearInterval(tick);
        void ctx.close();
        for (const tr of stream.getTracks()) tr.stop();
        const type = mr.mimeType.startsWith("audio/mp4") ? "audio/mp4" : "audio/webm";
        const blob = new Blob(chunks, { type });
        const len = Math.max(1, Math.min(GUEST_VOICE_MAX_SEC, (Date.now() - t0) / 1000));
        setTake({ blob, url: URL.createObjectURL(blob), type, secs: len, bars: bars.current });
        setState("review");
      };
      rec.current = mr;
      mr.start();
      setSecs(0);
      setLive([]);
      setPos(0);
      setState("rec");
    } catch {
      setDenied(true);
    }
  };
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().then(() => setPlaying(true));
    else {
      a.pause();
      setPlaying(false);
    }
  };

  const recording = state === "rec";
  const reviewing = state === "review" || state === "sending";
  const played = take ? Math.round((pos / take.secs) * BARS) : 0;

  return (
    <Screen
      bottom={
        sent ? (
          <Primary onClick={onClose}>{t.menu}</Primary>
        ) : reviewing ? (
          <div className="flex gap-3">
            <Secondary disabled={state === "sending"} onClick={() => void start()}>
              {t.again}
            </Secondary>
            <Primary
              disabled={state === "sending" || !take}
              onClick={async () => {
                if (!take) return;
                audio.current?.pause();
                setState("sending");
                await onSend(take.blob, take.type);
              }}
            >
              {t.send}
            </Primary>
          </div>
        ) : null
      }
    >
      <TopBar
        onBack={sent ? undefined : onClose}
        title={sent ? t.sentTitle : reviewing ? t.reviewTitle : t.voiceTitle(info.name)}
      />
      <div className="mt-6">
        <Cassette spin={recording || playing} from={from} to={info.name} done={sent} />
      </div>
      {sent ? (
        <p className="mt-8 text-center text-[15px] leading-snug text-paper/75">
          {t.sentBody(info.name)}
        </p>
      ) : (
        <>
          <div className="mt-7 flex flex-col items-center">
            <span
              className={`font-mono leading-none font-medium tracking-[-0.03em] whitespace-nowrap ${reviewing ? "text-[34px]" : "text-[52px]"}`}
              aria-live="polite"
            >
              {reviewing && take ? `${mmss(pos)} / ${mmss(take.secs)}` : mmss(secs)}
            </span>
            <span className="mt-2 font-mono text-xs text-muted">
              {recording
                ? t.remaining(Math.max(0, GUEST_VOICE_MAX_SEC - Math.floor(secs)))
                : reviewing
                  ? t.reviewBody
                  : t.voiceIdea}
            </span>
          </div>
          <div className="mt-5">
            <Wave
              bars={reviewing && take ? take.bars : live}
              filled={reviewing && take ? take.bars.length : live.length}
              played={reviewing ? played : 0}
            />
          </div>
          {denied && <p className="mt-4 text-center text-sm font-bold text-coral">{t.micDenied}</p>}
          <div className="mt-6 flex flex-col items-center gap-2">
            {reviewing ? (
              <button
                type="button"
                onClick={toggle}
                aria-label={playing ? t.pause : t.play}
                className="flex size-[76px] items-center justify-center rounded-full bg-paper text-ink"
              >
                {playing ? (
                  <Pause size={30} fill="currentColor" />
                ) : (
                  <Play size={30} fill="currentColor" className="ml-1" />
                )}
              </button>
            ) : (
              <button
                type="button"
                aria-label={recording ? t.stop : t.record}
                onClick={() => (recording ? rec.current?.stop() : void start())}
                className="flex size-[84px] items-center justify-center rounded-full border-4 border-paper"
              >
                {recording ? (
                  <span className="size-8 rounded-lg bg-coral-strong" />
                ) : (
                  <span className="size-[62px] rounded-full bg-coral-strong" />
                )}
              </button>
            )}
            <span className="text-[13px] font-bold text-paper/80">
              {reviewing ? (playing ? t.pause : t.play) : recording ? t.stop : t.record}
            </span>
          </div>
        </>
      )}
      {take && (
        <audio
          ref={audio}
          src={take.url}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onEnded={() => setPlaying(false)}
          hidden
        >
          <track kind="captions" />
        </audio>
      )}
    </Screen>
  );
}
