"use client";
import type { GuestMe } from "@tetra/shared";
import { ArrowUpRight, Camera, Check, Frame, Images, Lock, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { CameraArt } from "./CameraArt";
import { dotDate, firstName, Primary, TetraMark } from "./ui";

const t = copy.guestCam;
export type FrameState = "on" | "locked" | "wait" | "full" | "off";

const card =
  "relative flex flex-col overflow-hidden rounded-[28px] p-4 text-left text-ink transition-transform active:scale-[.97] motion-safe:animate-[rise_.5s_ease-out_both]";
const Arrow = () => (
  <span className="absolute top-3.5 right-3.5 flex size-9 items-center justify-center rounded-full bg-ink text-paper">
    <ArrowUpRight size={18} />
  </span>
);

/** Ilustrasi tiga ukuran frame: strip 2R, 4R, polaroid. */
function Frames() {
  return (
    <span className="flex items-end gap-1.5" aria-hidden>
      <span className="flex h-[58px] w-[20px] flex-col gap-[3px] rounded-[3px] bg-white p-[3px] shadow-[0_0_0_1.5px_#1D1D1B]">
        <span className="flex-1 rounded-[1px] bg-ink/70" />
        <span className="flex-1 rounded-[1px] bg-ink/70" />
        <span className="flex-1 rounded-[1px] bg-ink/70" />
      </span>
      <span className="grid h-[52px] w-[36px] grid-cols-2 gap-[3px] rounded-[3px] bg-white p-[3px] pb-2 shadow-[0_0_0_1.5px_#1D1D1B]">
        <span className="rounded-[1px] bg-ink/70" />
        <span className="rounded-[1px] bg-ink/70" />
        <span className="rounded-[1px] bg-ink/70" />
        <span className="rounded-[1px] bg-ink/70" />
      </span>
      <span className="flex h-[44px] w-[36px] rotate-6 flex-col rounded-[3px] bg-white p-[3px] pb-2.5 shadow-[0_0_0_1.5px_#1D1D1B]">
        <span className="flex-1 rounded-[1px] bg-ink/70" />
      </span>
    </span>
  );
}

/**
 * Menu utama tamu (#212): satu layar untuk pindah mode, yaitu kamera (kartu besar, sisa film), ucapan suara,
 * photo frame (2R/4R/polaroid/desain booth), dan album. Juga layar "film habis" (menggantikan A5).
 */
export function Home({
  info,
  me,
  left,
  used,
  voice,
  frame,
  onCamera,
  onVoice,
  onFrame,
  onAlbum,
}: {
  info: GuestInfo;
  me: GuestMe;
  left: number;
  used: number;
  voice: "on" | "sent" | "off";
  frame: FrameState;
  onCamera: () => void;
  onVoice: () => void;
  onFrame: () => void;
  onAlbum: () => void;
}) {
  const out = left <= 0;
  // Panduan singkat sekali per acara per HP (#247): tamu Rafi & Dinda bingung saat pertama masuk.
  const introKey = `gc-intro-${info.link}`;
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    try {
      setIntro(!out && !localStorage.getItem(introKey));
    } catch {}
  }, [introKey, out]);
  const closeIntro = (go?: boolean) => {
    try {
      localStorage.setItem(introKey, "1");
    } catch {}
    setIntro(false);
    if (go) onCamera();
  };
  const steps = [
    { icon: <Camera size={20} />, text: t.introCamera(left) },
    ...(frame !== "off" ? [{ icon: <Frame size={20} />, text: t.introFrame }] : []),
    ...(voice !== "off" ? [{ icon: <Mic size={20} />, text: t.introVoice }] : []),
    { icon: <Images size={20} />, text: t.introAlbum },
  ];
  const thumbs = me.revealed ? me.photos.slice(-4).reverse() : [];
  const d = (ms: number) => ({ animationDelay: `${ms}ms` });

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col gap-3 overflow-hidden bg-black px-4 pt-[max(14px,env(safe-area-inset-top))] pb-[max(16px,env(safe-area-inset-bottom))] text-paper">
      <div className="flex flex-none items-center justify-between">
        <TetraMark />
        <span className="rounded-full bg-white/10 px-3 py-1.5 font-mono text-[11px] tracking-wider">
          {dotDate(info.date)}
        </span>
      </div>
      <div className="flex-none pt-1">
        <p className="text-sm text-paper/60">{t.hello(firstName(me.name))}</p>
        <h1 className="line-clamp-2 text-[28px] leading-[1.02] font-extrabold tracking-[-0.04em] max-[380px]:text-[24px]">
          {info.name}
        </h1>
      </div>

      {/* Kamera: kartu utama, mengisi sisa layar */}
      <button
        type="button"
        onClick={onCamera}
        disabled={out}
        aria-label={out ? t.filmOut : t.modeCamera}
        className={`${card} min-h-[150px] flex-1 bg-butter disabled:active:scale-100`}
        style={d(60)}
      >
        {!out && <Arrow />}
        <span className="font-mono text-[11px] font-bold tracking-[0.18em] uppercase opacity-70">
          {t.modeCameraKicker}
        </span>
        <span className="mt-1 text-[26px] leading-none font-extrabold tracking-[-0.03em]">
          {out ? t.thanks(firstName(me.name)) : t.modeCamera}
        </span>
        <span className="mt-1.5 max-w-[60%] text-[13px] leading-snug opacity-75">
          {out
            ? info.reveal === "after" && !me.revealed
              ? t.doneAfter
              : t.doneLive
            : t.modeCameraSub}
        </span>
        <span className="pointer-events-none absolute -right-6 -bottom-8 rotate-[-10deg]">
          <CameraArt id="instant" body="#F8F7F4" size={200} />
        </span>
        <span className="flex-1" />
        <span className="relative flex items-baseline gap-1.5">
          <span className="font-mono text-[44px] leading-none font-medium tracking-[-0.05em]">
            {String(left).padStart(2, "0")}
          </span>
          <span className="text-[13px] font-bold">{out ? t.filmOut : t.shotsLeft}</span>
        </span>
        <span className="relative mt-2 flex max-w-[58%] gap-[3px]" aria-hidden>
          {Array.from({ length: info.shots }, (_, n) => n).map((i) => (
            <span
              key={i}
              className={`h-2 flex-1 rounded-full ${i < used ? "bg-ink" : "bg-ink/20"}`}
            />
          ))}
        </span>
      </button>

      <div className="grid flex-none grid-cols-2 gap-3">
        {voice !== "off" && (
          <button
            type="button"
            onClick={onVoice}
            className={`${card} h-[158px] bg-peach max-[380px]:h-[140px]`}
            style={d(140)}
          >
            {voice === "sent" ? (
              <span className="absolute top-3.5 right-3.5 flex size-9 items-center justify-center rounded-full bg-green text-white">
                <Check size={18} strokeWidth={3} />
              </span>
            ) : (
              <Arrow />
            )}
            <svg width="52" height="36" viewBox="0 0 30 22" aria-hidden>
              <rect x="1" y="1" width="28" height="20" rx="3" fill="#1D1D1B" />
              <rect x="5" y="5" width="20" height="8" rx="4" fill="#F8F7F4" />
              <circle cx="10" cy="9" r="2.5" fill="#1D1D1B" />
              <circle cx="20" cy="9" r="2.5" fill="#1D1D1B" />
              <rect x="9" y="16" width="12" height="3" rx="1.5" fill="#FCE3C6" />
            </svg>
            <span className="flex-1" />
            <span className="text-[17px] leading-tight font-extrabold">{t.modeVoice}</span>
            <span className="mt-0.5 text-xs leading-snug opacity-70">
              {voice === "sent" ? t.modeVoiceSent : t.modeVoiceSub}
            </span>
          </button>
        )}
        {frame !== "off" && (
          <button
            type="button"
            onClick={onFrame}
            disabled={frame !== "on"}
            className={`${card} h-[158px] bg-lavender max-[380px]:h-[140px] ${voice === "off" ? "col-span-2" : ""}`}
            style={d(200)}
          >
            {frame === "on" ? (
              <Arrow />
            ) : (
              <span className="absolute top-3.5 right-3.5 flex size-9 items-center justify-center rounded-full bg-ink/10">
                <Lock size={16} />
              </span>
            )}
            <Frames />
            <span className="flex-1" />
            <span className="text-[17px] leading-tight font-extrabold">{t.modeFrame}</span>
            <span className="mt-0.5 text-xs leading-snug opacity-70">{t.frameState[frame]}</span>
          </button>
        )}
      </div>

      {/* Album */}
      <button
        type="button"
        onClick={onAlbum}
        className="flex h-[76px] flex-none items-center gap-3 rounded-[24px] bg-white/10 px-3 text-left transition-transform active:scale-[.98] motion-safe:animate-[rise_.5s_ease-out_both]"
        style={d(260)}
      >
        <span className="flex flex-none -space-x-4">
          {(thumbs.length ? thumbs : [0, 1, 2]).map((p, i) =>
            typeof p === "number" ? (
              <span
                key={p}
                className="h-[52px] w-[40px] rounded-lg border-2 border-black bg-[#4a2f1a]"
                style={{ transform: `rotate(${(i - 1) * 6}deg)` }}
              />
            ) : (
              // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan
              <img
                key={p.idx}
                src={p.thumbUrl ?? p.url}
                alt=""
                className="h-[52px] w-[40px] rounded-lg border-2 border-black object-cover"
                style={{ transform: `rotate(${(i - 1) * 6}deg)` }}
              />
            ),
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-extrabold">{t.modeAlbum}</span>
          <span className="block truncate text-xs text-paper/60">
            {me.revealed ? t.modeAlbumSub : t.developing}
          </span>
        </span>
        <ArrowUpRight size={20} className="flex-none text-paper/60" />
      </button>

      {intro && (
        <div
          className="fixed inset-0 z-30 mx-auto flex max-w-[480px] items-end bg-black/60"
          role="dialog"
          aria-label={t.introTitle}
        >
          <div className="w-full rounded-t-[30px] bg-[#151514] px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))] motion-safe:animate-[enter_.25s_ease-out]">
            <h2 className="text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
              {t.introTitle}
            </h2>
            <ol className="mt-4 flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={s.text} className="flex items-center gap-3.5">
                  <span className="flex size-11 flex-none items-center justify-center rounded-2xl bg-butter text-ink">
                    {s.icon}
                  </span>
                  <span className="text-[15px] leading-snug">
                    <b className="font-mono text-paper/50">{i + 1}. </b>
                    {s.text}
                  </span>
                </li>
              ))}
            </ol>
            <Primary className="mt-5" onClick={() => closeIntro(true)}>
              {t.introGo}
            </Primary>
            <button
              type="button"
              onClick={() => closeIntro()}
              className="mt-2 min-h-11 w-full text-sm font-bold text-paper/70"
            >
              {t.introLater}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
