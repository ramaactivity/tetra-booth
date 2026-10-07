"use client";
import { GUEST_VOICE_MAX_SEC } from "@tetra/shared";
import { Pause, Play, RotateCcw, Send, Shuffle, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { firstName, Primary, TopBar } from "./ui";

const t = copy.guestCam;
const BARS = 36;
type Take = {
  blob: Blob;
  url: string;
  type: "audio/webm" | "audio/mp4";
  secs: number;
  bars: number[];
};
const mmss = (s: number) =>
  `00:${String(Math.min(99, Math.max(0, Math.floor(s)))).padStart(2, "0")}`;

/** Gulungan kaset: lingkar pita `tape` (0..1) membesar/mengecil sesuai durasi, berputar saat jalan. */
function Reel({ tape, spin }: { tape: number; spin: boolean }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className="aspect-square h-full max-h-[104px] flex-none">
      <circle cx="32" cy="32" r={11 + tape * 13} fill="#4a2f1a" />
      <g
        className={spin ? "motion-safe:animate-spin motion-safe:[animation-duration:2s]" : ""}
        style={{ transformOrigin: "32px 32px" }}
      >
        <circle cx="32" cy="32" r="10" fill="#F8F7F4" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect
            key={a}
            x="30.5"
            y="23"
            width="3"
            height="5"
            rx="1"
            fill="#1D1D1B"
            transform={`rotate(${a} 32 32)`}
          />
        ))}
        <circle cx="32" cy="32" r="3" fill="#1D1D1B" />
      </g>
    </svg>
  );
}

/**
 * Voice note (#209/#213): tape recorder peach. LCD berisi status, waktu, dan VU meter; kaset berlabel To/From
 * dengan pita yang pindah dari gulungan kiri ke kanan sesuai durasi; tombol deck (ulang / rekam-putar / kirim).
 * Maks. 30 dtk, berhenti sendiri, satu per tamu. MediaRecorder webm/opus (mp4 di iOS), VU dari AnalyserNode.
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
  const [idea, setIdea] = useState(0);

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
  // Posisi pita 0..1 dari 30 dtk: rekam = waktu berjalan, dengar ulang = posisi putar.
  const p = sent
    ? 1
    : recording
      ? secs / GUEST_VOICE_MAX_SEC
      : reviewing
        ? pos / GUEST_VOICE_MAX_SEC
        : 0;
  const shown = reviewing && take ? take.bars : live;
  const played = reviewing && take ? Math.round((pos / take.secs) * take.bars.length) : 0;
  const status = sent
    ? "SENT"
    : recording
      ? "REC"
      : reviewing
        ? playing
          ? "PLAY"
          : "PAUSE"
        : "READY";
  const main = reviewing ? (playing ? t.pause : t.play) : recording ? t.stop : t.record;
  const key =
    "flex flex-col items-center gap-1.5 text-xs font-bold text-paper/75 disabled:opacity-35";
  const cap =
    "flex size-14 items-center justify-center rounded-2xl bg-white/10 text-paper transition active:scale-90";

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))] text-paper">
      <TopBar
        onBack={state === "sending" ? undefined : onClose}
        title={t.voiceTitle}
        right={
          <span className="rounded-full bg-white/10 px-2.5 py-1 font-mono text-xs">
            {GUEST_VOICE_MAX_SEC}s
          </span>
        }
      />

      {/* Tape recorder */}
      <section className="mt-3 flex min-h-0 flex-1 flex-col rounded-[32px] bg-peach p-3.5 text-ink motion-safe:animate-[rise_.5s_ease-out_both]">
        <div className="flex items-center justify-between px-1.5 font-mono text-[10px] font-bold tracking-[0.2em]">
          <span>TETRA · TAPE-30</span>
          <span className="flex items-center gap-1.5">
            <span
              className={`size-2.5 rounded-full ${recording ? "bg-coral-strong motion-safe:animate-pulse" : "bg-ink/15"}`}
            />
            REC
          </span>
        </div>

        {/* LCD */}
        <div className="mt-2.5 rounded-2xl bg-ink px-4 pt-3 pb-3.5 text-mint">
          <div className="flex items-end justify-between font-mono">
            <span className="text-[11px] font-bold tracking-[0.2em] opacity-80" aria-live="polite">
              {status}
            </span>
            <span className="text-[34px] leading-none font-medium tracking-[-0.03em]">
              {mmss(reviewing ? pos : sent ? 0 : secs)}
              <span className="text-base opacity-50">
                /{mmss(reviewing && take ? take.secs : GUEST_VOICE_MAX_SEC)}
              </span>
            </span>
          </div>
          <div className="mt-3 flex h-9 items-center gap-[3px]" aria-hidden>
            {Array.from({ length: BARS }, (_, n) => n).map((i) => (
              <span
                key={i}
                className={`flex-1 rounded-full ${i >= shown.length ? "bg-mint/15" : reviewing && i >= played ? "bg-mint/40" : "bg-mint"}`}
                style={{
                  height: i < shown.length ? Math.max(4, Math.round((shown[i] ?? 0.2) * 36)) : 4,
                }}
              />
            ))}
          </div>
        </div>

        {/* Kaset: mengisi sisa bodi */}
        <div className="relative mt-2.5 flex min-h-0 flex-1 flex-col rounded-[22px] bg-paper p-3 shadow-[0_0_0_2px_#1D1D1B]">
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-butter px-3.5 pt-2.5 pb-3">
            <div className="flex items-center justify-between font-mono text-[10px] font-bold tracking-[0.18em] opacity-60">
              <span>SIDE A</span>
              <span>{GUEST_VOICE_MAX_SEC} SEC</span>
            </div>
            <div className="flex flex-1 flex-col justify-center">
              <div className="flex items-baseline gap-2">
                <span className="w-10 flex-none font-mono text-[10px] font-bold opacity-55">
                  TO
                </span>
                <span className="truncate text-lg leading-tight font-extrabold">{info.name}</span>
              </div>
              <div className="flex items-baseline gap-2 border-t-[1.5px] border-dashed border-ink/25 pt-0.5">
                <span className="w-10 flex-none font-mono text-[10px] font-bold opacity-55">
                  FROM
                </span>
                <span className="truncate text-lg leading-tight font-extrabold">
                  {firstName(name)}
                </span>
              </div>
            </div>
            <div className="mt-3 flex h-[clamp(72px,13dvh,104px)] flex-none items-center justify-between gap-2 rounded-full bg-ink px-2 py-1.5">
              <Reel tape={1 - p} spin={recording || playing} />
              <div className="h-[34%] flex-1 rounded-md bg-[#4a2f1a]/70" />
              <Reel tape={p} spin={recording || playing} />
            </div>
          </div>
          <div className="mx-auto mt-2.5 flex h-4 w-1/2 items-center justify-around" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="size-2 rounded-full bg-ink/30" />
            ))}
          </div>
          {sent && (
            <span className="absolute -top-3 -right-2 rotate-6 rounded-lg bg-green px-3 py-1 text-sm font-extrabold text-white">
              {t.sentStamp}
            </span>
          )}
        </div>

        {/* Ide / status */}
        <div className="mt-3 min-h-[52px] px-1.5">
          {denied ? (
            <p className="text-[13px] leading-snug font-bold text-coral-strong">{t.micDenied}</p>
          ) : sent ? (
            <p className="text-[15px] leading-snug font-bold">{t.sentBody(info.name)}</p>
          ) : reviewing ? (
            <p className="text-[15px] leading-snug font-bold">{t.reviewBody}</p>
          ) : (
            <button
              type="button"
              onClick={() => setIdea((i) => (i + 1) % t.voiceIdeas.length)}
              aria-label={t.voiceIdeaNext}
              className="flex w-full items-center gap-3 text-left"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold tracking-wider uppercase opacity-55">
                  {t.voiceIdeaKicker}
                </span>
                <span
                  key={idea}
                  className="block text-[15px] leading-snug font-extrabold motion-safe:animate-[enter_.25s_ease-out]"
                >
                  {t.voiceIdeas[idea]}
                </span>
              </span>
              <span className="flex size-10 flex-none items-center justify-center rounded-full bg-ink/10">
                <Shuffle size={18} />
              </span>
            </button>
          )}
        </div>
      </section>

      {/* Tombol deck */}
      <div className="mt-4 flex-none">
        {sent ? (
          <Primary onClick={onClose}>{t.menu}</Primary>
        ) : (
          <div className="grid grid-cols-3 items-end">
            <button
              type="button"
              className={`${key} justify-self-start`}
              disabled={!reviewing || state === "sending"}
              onClick={() => void start()}
            >
              <span className={cap}>
                <RotateCcw size={22} />
              </span>
              {t.again}
            </button>
            <button
              type="button"
              className={`${key} justify-self-center`}
              disabled={state === "sending"}
              aria-label={main}
              onClick={() =>
                reviewing ? toggle() : recording ? rec.current?.stop() : void start()
              }
            >
              <span className="flex size-[78px] items-center justify-center rounded-full border-4 border-paper transition active:scale-90">
                {reviewing ? (
                  <span className="flex size-[60px] items-center justify-center rounded-full bg-paper text-ink">
                    {playing ? (
                      <Pause size={26} fill="currentColor" />
                    ) : (
                      <Play size={26} fill="currentColor" className="ml-1" />
                    )}
                  </span>
                ) : recording ? (
                  <Square size={28} fill="currentColor" className="text-coral-strong" />
                ) : (
                  <span className="size-[60px] rounded-full bg-coral-strong" />
                )}
              </span>
              <span className="text-paper">{main}</span>
            </button>
            <button
              type="button"
              className={`${key} justify-self-end`}
              disabled={!reviewing || state === "sending" || !take}
              onClick={async () => {
                if (!take) return;
                audio.current?.pause();
                setPlaying(false);
                setState("sending");
                await onSend(take.blob, take.type);
              }}
            >
              <span className={`${cap} ${reviewing ? "bg-butter text-ink" : ""}`}>
                <Send size={22} />
              </span>
              {state === "sending" ? t.sendingVoice : t.send}
            </button>
          </div>
        )}
      </div>

      {take && (
        <audio
          ref={audio}
          src={take.url}
          onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
          onEnded={() => {
            setPlaying(false);
            setPos(0);
          }}
          hidden
        >
          <track kind="captions" />
        </audio>
      )}
    </main>
  );
}
