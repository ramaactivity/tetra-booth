"use client";
import { GUEST_VOICE_MAX_SEC } from "@tetra/shared";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { Card, dotDate, firstName, H1, Head, Lead, Primary, Screen, Secondary } from "./ui";

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
  `00:${String(Math.min(99, Math.max(0, Math.round(s)))).padStart(2, "0")}`;

/** 40 batang waveform; `filled` = berapa yang sudah terisi (gelap), sisanya garis tipis. */
function Wave({
  bars,
  filled,
  played = 0,
  h = 72,
}: {
  bars: number[];
  filled: number;
  played?: number;
  h?: number;
}) {
  return (
    <div className="flex items-center gap-[3px]" style={{ height: h }} aria-hidden>
      {Array.from({ length: BARS }, (_, n) => n).map((i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${i < played ? "bg-mint" : i < filled ? "bg-ink" : "bg-line-soft"}`}
          style={{ height: i < filled ? Math.max(6, Math.round((bars[i] ?? 0.2) * (h - 16))) : 4 }}
        />
      ))}
    </div>
  );
}

/**
 * A8 Ucapan suara (VoiceRecorder): merekam (timer Geist Mono 64, berhenti sendiri di 00:30) → dengar ulang →
 * kirim (terkunci, satu per tamu). MediaRecorder webm/opus, mp4 di iOS. Amplitudo dari AnalyserNode.
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
  const [secs, setSecs] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [take, setTake] = useState<Take | null>(null);
  const [state, setState] = useState<"idle" | "rec" | "review" | "sending">("idle");
  const [denied, setDenied] = useState(false);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(
    () => () => {
      for (const tr of rec.current?.stream.getTracks() ?? []) tr.stop();
    },
    [],
  );

  const start = async () => {
    setDenied(false);
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
        setSecs(Math.floor(s));
        if (s >= GUEST_VOICE_MAX_SEC && mr.state === "recording") mr.stop();
      }, 100);
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        clearInterval(tick);
        void ctx.close();
        for (const tr of stream.getTracks()) tr.stop();
        const type = mr.mimeType.startsWith("audio/mp4") ? "audio/mp4" : "audio/webm";
        const blob = new Blob(chunks, { type });
        const secs = Math.max(1, Math.min(GUEST_VOICE_MAX_SEC, (Date.now() - t0) / 1000));
        setTake({ blob, url: URL.createObjectURL(blob), type, secs, bars: bars.current });
        setState("review");
      };
      rec.current = mr;
      mr.start();
      setSecs(0);
      setLive([]);
      setState("rec");
    } catch {
      setDenied(true);
    }
  };

  const head = (
    <Head title={info.name} sub={dotDate(info.date)} onClose={sent ? undefined : onClose} />
  );

  if (sent)
    return (
      <Screen bottom={<Primary onClick={onClose}>{t.keepShootingBtn}</Primary>}>
        {head}
        <span className="mt-[72px] flex size-[72px] items-center justify-center rounded-full border-[1.5px] border-ink bg-green text-[32px] font-extrabold text-white max-[380px]:mt-10">
          ✓
        </span>
        <H1 className="mt-[22px]">{t.sentTitle}</H1>
        <Lead>{t.sentBody(info.name)}</Lead>
        {take && (
          <div className="mt-7 flex items-center gap-3 rounded-2xl border-[1.5px] border-ink bg-white p-3.5">
            <PlayBtn small playing={playing} onClick={() => toggle()} />
            <div className="flex-1">
              <Wave
                bars={take.bars}
                filled={BARS}
                h={32}
                played={Math.round((pos / take.secs) * BARS)}
              />
            </div>
            <span className="font-mono text-xs">{mmss(take.secs)}</span>
          </div>
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

  function toggle() {
    const a = audio.current;
    if (!a) return;
    if (a.paused) void a.play().then(() => setPlaying(true));
    else {
      a.pause();
      setPlaying(false);
    }
  }

  if (state === "review" || state === "sending")
    return (
      <Screen
        bottom={
          <div className="flex gap-3">
            <Secondary
              disabled={state === "sending"}
              onClick={() => {
                audio.current?.pause();
                setPlaying(false);
                void start();
              }}
            >
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
        }
      >
        {head}
        <H1 className="mt-8">{t.reviewTitle}</H1>
        <Lead>{t.reviewBody}</Lead>
        {take && (
          <Card className="mt-9 flex flex-col gap-[18px] bg-white">
            <div className="flex items-center gap-3.5">
              <PlayBtn playing={playing} onClick={toggle} />
              <div className="flex-1">
                <div className="text-[15px] font-extrabold">{t.voiceFrom(firstName(name))}</div>
                <div className="mt-0.5 font-mono text-[13px] text-text-2">
                  {mmss(pos)} / {mmss(take.secs)}
                </div>
              </div>
            </div>
            <Wave
              bars={take.bars}
              filled={take.bars.length}
              played={Math.round((pos / take.secs) * BARS)}
              h={56}
            />
            <audio
              ref={audio}
              src={take.url}
              onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
              onEnded={() => setPlaying(false)}
              hidden
            >
              <track kind="captions" />
            </audio>
          </Card>
        )}
      </Screen>
    );

  const recording = state === "rec";
  return (
    <Screen>
      {head}
      <H1 className="mt-8">{t.voiceTitle(info.name)}</H1>
      <p className="mt-3.5 rounded-[12px] border-[1.5px] border-dashed border-ink bg-lavender px-3.5 py-[11px] text-[13px] leading-[1.5]">
        {t.voiceIdea}
      </p>
      <div className="mt-11 flex flex-col items-center gap-1.5 max-[380px]:mt-6">
        {recording && (
          <span className="flex h-7 items-center gap-[7px] rounded-full border-[1.5px] border-ink bg-coral px-3 text-xs font-extrabold">
            <span className="size-2 rounded-full border-[1.5px] border-ink bg-coral-strong" />
            {t.recording}
          </span>
        )}
        <span
          className="font-mono text-[64px] leading-[1.05] font-medium tracking-[-0.03em]"
          aria-live="polite"
        >
          {mmss(secs)}
        </span>
        <span className="font-mono text-[13px] text-text-2">
          {t.remaining(GUEST_VOICE_MAX_SEC - secs)}
        </span>
      </div>
      <div className="mt-7">
        <Wave bars={live} filled={live.length} />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-text-2">
        <span>00:00</span>
        <span>{mmss(GUEST_VOICE_MAX_SEC)}</span>
      </div>
      {denied && <p className="mt-4 text-sm font-bold text-coral-strong">{t.micDenied}</p>}
      <div className="flex-1" />
      <div className="mt-6 flex flex-col items-center gap-2.5">
        <button
          type="button"
          aria-label={recording ? t.stop : t.record}
          onClick={() => (recording ? rec.current?.stop() : void start())}
          className="layered pressable flex size-[92px] items-center justify-center rounded-full border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:4px]"
        >
          {recording ? (
            <span className="size-[30px] rounded-[7px] bg-ink" />
          ) : (
            <span className="size-[34px] rounded-full border-[1.5px] border-ink bg-coral-strong" />
          )}
        </button>
        <span className="text-[13px] font-bold">{recording ? t.stop : t.record}</span>
      </div>
    </Screen>
  );
}

function PlayBtn({
  playing,
  onClick,
  small,
}: {
  playing: boolean;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? t.pause : t.play}
      className={`flex flex-none items-center justify-center rounded-full border-[1.5px] border-ink ${small ? "size-10 bg-white" : "size-14 bg-butter"}`}
    >
      {playing ? (
        <span className="flex gap-[5px]">
          <span className={`w-[5px] rounded-[2px] bg-ink ${small ? "h-3.5" : "h-[18px]"}`} />
          <span className={`w-[5px] rounded-[2px] bg-ink ${small ? "h-3.5" : "h-[18px]"}`} />
        </span>
      ) : (
        <span className="ml-[3px] h-0 w-0 border-y-[7px] border-l-[12px] border-y-transparent border-l-ink" />
      )}
    </button>
  );
}
