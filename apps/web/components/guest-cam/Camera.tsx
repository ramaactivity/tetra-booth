"use client";
import { GUEST_PRESETS, guestPreset, stampText } from "@tetra/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { CameraIcon, firstName, goFullscreen, H1, Lead, Primary, Screen, Tag } from "./ui";

const t = copy.guestCam;
type Cam = "ask" | "on" | "denied" | "inapp";

/** Status kiriman dari antrean IndexedDB (pil kanan atas & lembar status). */
export type Upload = { sent: number[]; waiting: number[]; failing: boolean; online: boolean };

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Nama aplikasi kalau dibuka dari browser dalam aplikasi. */
const inAppName = () => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return /Instagram/i.test(ua)
    ? "Instagram"
    : /FBAN|FBAV|FB_IAB/i.test(ua)
      ? "Facebook"
      : /Line\//i.test(ua)
        ? "LINE"
        : /musical_ly|BytedanceWebview|TikTok/i.test(ua)
          ? "TikTok"
          : null;
};

/** Noise SVG kecil untuk pratinjau grain (piksel asli diproses applyGuestPreset). */
const GRAIN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  );
}
const FLASH = "M13 2 4 14h7l-1 8 9-12h-7z";
const TIMER = "M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z";
const FLIP = "M3 7h11a4 4 0 0 1 4 4v1M21 17H10a4 4 0 0 1-4-4v-1M15 4l3 3-3 3M9 20l-3-3 3-3";

/**
 * Kamera Guest Cam v2 (#209, gaya Dazz): viewfinder 3:4, laci "kamera" (preset film bernama Inggris), flash,
 * timer, stempel tanggal, ganti kamera. Pratinjau = CSS filter + overlay grain/vignette/tanggal; piksel asli
 * diproses capture.ts. Izin kamera (ask/denied/in-app) tetap berbahasa Indonesia.
 */
export function Camera({
  info,
  name,
  left,
  used,
  upload,
  lastThumb,
  onShot,
  onMine,
  onSendNow,
}: {
  info: GuestInfo;
  name: string;
  left: number;
  used: number;
  upload: Upload;
  lastThumb: string | null;
  onShot: (video: HTMLVideoElement, preset: string, stamp: boolean) => Promise<void>;
  onMine: () => void;
  onSendNow: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const swipe = useRef<number | null>(null);
  const [cam, setCam] = useState<Cam>("ask");
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [pi, setPi] = useState(() => {
    try {
      return Math.max(
        0,
        GUEST_PRESETS.findIndex((p) => p.id === localStorage.getItem("gc-preset")),
      );
    } catch {
      return 0;
    }
  });
  const preset = GUEST_PRESETS[pi] ?? guestPreset("original");
  const [stamp, setStamp] = useState<boolean>(preset.stamp);
  const [flash, setFlash] = useState(false);
  const [timer, setTimer] = useState<0 | 3 | 10>(0);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [white, setWhite] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [os, setOs] = useState<"ios" | "android">(() =>
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) ? "android" : "ios",
  );
  const after = info.reveal === "after";
  const app = inAppName();

  const start = useCallback(
    async (face: "user" | "environment") => {
      for (const tr of stream.current?.getTracks() ?? []) tr.stop();
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: face, width: { ideal: 2560 }, height: { ideal: 1920 } },
        });
        stream.current = s;
        setCam("on");
        requestAnimationFrame(() => {
          if (video.current) {
            video.current.srcObject = s;
            void video.current.play().catch(() => {});
          }
        });
      } catch {
        setCam(app ? "inapp" : "denied");
      }
    },
    [app],
  );

  useEffect(() => {
    navigator.permissions
      ?.query({ name: "camera" as PermissionName })
      .then((p) => {
        if (p.state === "granted") void start("environment");
      })
      .catch(() => {});
    return () => {
      for (const tr of stream.current?.getTracks() ?? []) tr.stop();
    };
  }, [start]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1400);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (!badge) return;
    const id = setTimeout(() => setBadge(null), 900);
    return () => clearTimeout(id);
  }, [badge]);

  const pick = (i: number) => {
    const n = (i + GUEST_PRESETS.length) % GUEST_PRESETS.length;
    const p = GUEST_PRESETS[n] ?? guestPreset("original");
    setPi(n);
    setStamp(p.stamp);
    setBadge(p.name);
    try {
      localStorage.setItem("gc-preset", p.id);
    } catch {}
  };

  const torch = async (on: boolean) => {
    const track = stream.current?.getVideoTracks()[0];
    await track
      ?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .catch(() => {});
  };

  const shoot = async () => {
    const v = video.current;
    if (!v || busy || left <= 0 || cam !== "on") return;
    goFullscreen();
    setBusy(true);
    try {
      for (let s = timer; s > 0; s--) {
        setCount(s);
        await sleep(1000);
      }
      setCount(0);
      const rm = reduced();
      if (flash && facing === "user") {
        setWhite(true);
        await sleep(280);
      } else if (flash) {
        await torch(true);
        await sleep(350);
      } else await sleep(rm ? 0 : 120);
      await onShot(v, preset.id, stamp);
      if (flash && facing !== "user") void torch(false);
      setWhite(!rm);
      setTimeout(() => setWhite(false), 150);
      setToast(
        rm
          ? t.saved
          : after
            ? t.toastAfter
            : info.approval === "manual"
              ? t.toastReview
              : t.toastLive,
      );
    } finally {
      setBusy(false);
    }
  };

  if (cam !== "on")
    return (
      <Permission
        cam={cam}
        app={app}
        os={os}
        setOs={setOs}
        name={name}
        onOpen={() => {
          goFullscreen();
          void start(facing);
        }}
      />
    );

  const pending = upload.waiting.length;
  const failing = upload.failing && upload.online;
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black text-paper select-none">
      {/* Bar atas: sisa film · nama · status kiriman */}
      <div className="flex flex-none items-center justify-between gap-2 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2">
        <span
          className="flex h-9 items-center gap-1.5 rounded-full bg-text-3 px-3 font-mono text-sm"
          role="status"
          aria-label={`${left} foto lagi`}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
          >
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M7 5v14M17 5v14" />
          </svg>
          {left}
        </span>
        <span className="min-w-0 truncate text-[13px] font-bold text-paper/80">
          {firstName(name)} · {info.name}
        </span>
        <button
          type="button"
          onClick={() => setSheet(true)}
          className={`flex h-9 flex-none items-center gap-1.5 rounded-full px-3 text-xs font-bold ${!pending ? "bg-text-3" : failing ? "bg-coral text-ink" : "bg-peach text-ink"}`}
        >
          <span
            className={`size-2 rounded-full ${!pending ? "bg-green" : "border-[1.5px] border-dashed border-ink"}`}
          />
          {!pending
            ? t.safe
            : !upload.online
              ? t.waiting(pending)
              : failing
                ? t.failing(pending)
                : t.sending(pending)}
        </button>
      </div>

      {/* Viewfinder 3:4 */}
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <div
          className="relative aspect-[3/4] max-h-full w-full overflow-hidden rounded-[22px] bg-text-3"
          onPointerDown={(e) => {
            swipe.current = e.clientX;
          }}
          onPointerUp={(e) => {
            if (swipe.current === null) return;
            const d = e.clientX - swipe.current;
            swipe.current = null;
            if (Math.abs(d) > 40) pick(pi + (d < 0 ? 1 : -1));
          }}
        >
          <video
            ref={video}
            playsInline
            muted
            autoPlay
            className="absolute inset-0 size-full object-cover transition-[filter] duration-200"
            style={{ filter: preset.css, transform: facing === "user" ? "scaleX(-1)" : undefined }}
          />
          {preset.vignette > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${preset.vignette}))`,
              }}
            />
          )}
          {preset.grain > 0 && (
            <div
              className="pointer-events-none absolute inset-0 mix-blend-overlay"
              style={{ backgroundImage: GRAIN, opacity: preset.grain * 1.6 }}
            />
          )}
          {stamp && (
            <span className="pointer-events-none absolute right-[5%] bottom-[4%] font-mono text-[15px] font-semibold text-[#FF9A3C] [text-shadow:0_0_6px_rgba(255,120,30,.8)]">
              {stampText(new Date())}
            </span>
          )}
          {white && <div className="pointer-events-none absolute inset-0 bg-white" />}
          {count > 0 && (
            <span
              key={count}
              className="absolute inset-0 flex items-center justify-center font-mono text-[96px] font-medium [text-shadow:0_2px_12px_rgba(0,0,0,.5)] motion-safe:animate-[tick_.3s_ease-out]"
            >
              {count}
            </span>
          )}
          {badge && (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-4 py-2 text-lg font-extrabold">
              {badge}
            </span>
          )}
          {toast && (
            <span
              role="status"
              className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[13px] font-bold whitespace-nowrap motion-safe:animate-[fade_.15s_ease-out]"
            >
              {toast}
            </span>
          )}
          {left <= 3 && left > 0 && (
            <span className="absolute top-3 right-3 rounded-full bg-peach px-2.5 py-1 font-mono text-xs text-ink">
              {t.few(left)}
            </span>
          )}
        </div>
      </div>

      {/* Alat: flash · timer · tanggal · ganti kamera */}
      <div className="flex flex-none items-center justify-around px-6 pt-4">
        <button
          type="button"
          aria-pressed={flash}
          aria-label="Flash"
          onClick={() => setFlash(!flash)}
          className={`flex size-11 items-center justify-center rounded-full ${flash ? "bg-butter text-ink" : "bg-text-3"}`}
        >
          <Icon d={FLASH} />
        </button>
        <button
          type="button"
          aria-label={`Timer ${timer || "mati"}`}
          onClick={() => setTimer(timer === 0 ? 3 : timer === 3 ? 10 : 0)}
          className={`flex h-11 min-w-11 items-center justify-center gap-1 rounded-full px-2 ${timer ? "bg-butter text-ink" : "bg-text-3"}`}
        >
          <Icon d={TIMER} />
          {timer > 0 && <span className="font-mono text-xs font-bold">{timer}s</span>}
        </button>
        <button
          type="button"
          aria-pressed={stamp}
          aria-label="Tanggal"
          onClick={() => setStamp(!stamp)}
          className={`flex h-11 items-center justify-center rounded-full px-3 font-mono text-[13px] font-bold ${stamp ? "bg-[#FF9A3C] text-ink" : "bg-text-3"}`}
        >
          ’26
        </button>
        <button
          type="button"
          aria-label={t.flip}
          onClick={() => {
            const f = facing === "user" ? "environment" : "user";
            setFacing(f);
            void start(f);
          }}
          className="flex size-11 items-center justify-center rounded-full bg-text-3"
        >
          <Icon d={FLIP} />
        </button>
      </div>

      {/* Rana */}
      <div className="grid flex-none grid-cols-[1fr_auto_1fr] items-center px-7 pt-4 pb-[max(18px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label={t.lastShot}
          onClick={onMine}
          className="relative size-[58px] justify-self-start overflow-hidden rounded-2xl bg-text-3"
        >
          {lastThumb && !after ? (
            // biome-ignore lint/performance/noImgElement: object URL lokal
            <img src={lastThumb} alt="" className="size-full object-cover" />
          ) : used > 0 ? (
            <span className="absolute inset-1.5 flex items-center justify-center rounded-xl border-[1.5px] border-dashed border-paper/60 font-mono text-sm">
              {used}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label={t.shutter}
          disabled={left <= 0 || busy}
          onClick={() => void shoot()}
          className="flex size-[84px] items-center justify-center rounded-full border-4 border-paper disabled:opacity-40"
        >
          <span
            className={`size-[66px] rounded-full bg-paper transition-transform duration-100 ${busy ? "scale-90" : ""}`}
          />
        </button>
        <button
          type="button"
          aria-label={`Kamera: ${preset.name}`}
          onClick={() => setDrawer(true)}
          className="flex flex-col items-center justify-self-end"
        >
          <CameraIcon body={preset.body} size={58} />
          <span className="-mt-1 max-w-[84px] truncate text-[11px] font-bold">{preset.name}</span>
        </button>
      </div>

      {drawer && (
        <div
          className="fixed inset-0 z-30 mx-auto flex max-w-[480px] items-end"
          role="dialog"
          aria-label="Pilih kamera"
        >
          <button
            type="button"
            aria-label={t.close}
            onClick={() => setDrawer(false)}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative w-full rounded-t-[28px] bg-ink pt-4 pb-[max(20px,env(safe-area-inset-bottom))] motion-safe:animate-[enter_.2s_ease-out]">
            <div className="flex items-center justify-between px-5 pb-2">
              <span className="text-[15px] font-extrabold">Cameras</span>
              <button
                type="button"
                onClick={() => setDrawer(false)}
                aria-label={t.close}
                className="flex size-9 items-center justify-center rounded-full bg-text-3 text-sm"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
              {GUEST_PRESETS.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={i === pi}
                  onClick={() => {
                    pick(i);
                    setDrawer(false);
                  }}
                  className="flex w-[84px] flex-none flex-col items-center gap-1.5 py-2"
                >
                  <CameraIcon body={p.body} size={64} />
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${i === pi ? "bg-paper text-ink" : "text-paper/80"}`}
                  >
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {sheet && (
        <UploadSheet
          shots={info.shots}
          upload={upload}
          onClose={() => setSheet(false)}
          onSendNow={onSendNow}
        />
      )}
    </main>
  );
}

/** Izin kamera: minta, diblokir (langkah iPhone/Android), dibuka dari aplikasi lain. */
function Permission({
  cam,
  app,
  os,
  setOs,
  name,
  onOpen,
}: {
  cam: Cam;
  app: string | null;
  os: "ios" | "android";
  setOs: (o: "ios" | "android") => void;
  name: string;
  onOpen: () => void;
}) {
  if (cam === "ask")
    return (
      <Screen
        bottom={
          <>
            <Primary onClick={onOpen}>{t.askOpen}</Primary>
            <p className="text-center text-xs text-muted">{t.askNote}</p>
          </>
        }
      >
        <div className="mt-[14dvh] flex justify-center">
          <CameraIcon body="#F8D98B" size={112} />
        </div>
        <H1 className="mt-6 text-center">{t.askTitle(firstName(name))}</H1>
        <Lead className="text-center">{t.askBody}</Lead>
      </Screen>
    );
  if (cam === "inapp")
    return (
      <Screen bottom={<CopyLink big />}>
        <div className="mt-[10dvh]">
          <Tag bg="bg-sky">{t.inAppPill(app ?? "aplikasi")}</Tag>
        </div>
        <H1 className="mt-4">{t.inAppTitle}</H1>
        <Lead>{t.inAppBody(app ?? "aplikasi")}</Lead>
        <ol className="mt-6 flex flex-col gap-3 text-[15px] font-semibold">
          <li className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-paper font-mono text-sm text-ink">
              1
            </span>
            {t.inAppStep1[0]} <span className="rounded-md bg-text-3 px-2 font-extrabold">⋯</span>{" "}
            {t.inAppStep1[1]}
          </li>
          <li className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-text-3 font-mono text-sm">
              2
            </span>
            Pilih <b>{t.inAppStep2}</b>
          </li>
        </ol>
        <p className="mt-6 text-xs font-bold text-muted">{t.copyHint}</p>
        <CopyLink />
      </Screen>
    );
  const steps = os === "ios" ? t.stepsIos : t.stepsAndroid;
  return (
    <Screen bottom={<Primary onClick={() => location.reload()}>{t.retry}</Primary>}>
      <div className="mt-[10dvh]">
        <Tag bg="bg-coral">{t.deniedPill}</Tag>
      </div>
      <H1 className="mt-4">{t.deniedTitle}</H1>
      <Lead>{t.deniedBody}</Lead>
      <div className="mt-6 flex h-11 rounded-full bg-text-3 p-1">
        {(["ios", "android"] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={os === o}
            onClick={() => setOs(o)}
            className={`flex-1 rounded-full text-sm font-bold ${os === o ? "bg-paper text-ink" : "text-paper/70"}`}
          >
            {o === "ios" ? t.iphone : t.android}
          </button>
        ))}
      </div>
      <ol className="mt-6 flex flex-col gap-4">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3.5 text-[15px] leading-snug font-semibold">
            <span
              className={`flex size-8 flex-none items-center justify-center rounded-full font-mono text-sm ${i === 0 ? "bg-paper text-ink" : "bg-text-3"}`}
            >
              {i + 1}
            </span>
            <span className="pt-1">{s}</span>
          </li>
        ))}
      </ol>
    </Screen>
  );
}

/** Lembar status kiriman (ketuk pil kanan atas). */
function UploadSheet({
  shots,
  upload,
  onClose,
  onSendNow,
}: {
  shots: number;
  upload: Upload;
  onClose: () => void;
  onSendNow: () => void;
}) {
  const sent = new Set(upload.sent);
  const waiting = new Set(upload.waiting);
  const failed = upload.failing && upload.online;
  return (
    <div
      className="fixed inset-0 z-30 mx-auto flex max-w-[480px] items-end"
      role="dialog"
      aria-label={t.sheetTitle}
    >
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />
      <div className="relative flex w-full flex-col gap-4 rounded-t-[28px] bg-ink px-5 pt-4 pb-[max(22px,env(safe-area-inset-bottom))] text-paper motion-safe:animate-[enter_.2s_ease-out]">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold">{t.sheetTitle}</h2>
            <p className="mt-1 text-[13px] text-muted">{waiting.size ? t.sheetWeak : t.sheetOk}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="flex size-9 items-center justify-center rounded-full bg-text-3 text-sm"
          >
            ✕
          </button>
        </div>
        <div className="grid grid-cols-8 gap-1.5" aria-hidden>
          {Array.from({ length: shots }, (_, n) => n).map((i) => {
            const s = sent.has(i) ? "sent" : waiting.has(i) ? (failed ? "fail" : "wait") : "none";
            return (
              <span
                key={i}
                className={`flex aspect-square items-center justify-center rounded-lg font-mono text-[10px] ${s === "sent" ? "bg-mint text-ink" : s === "wait" ? "bg-peach text-ink" : s === "fail" ? "bg-coral text-ink" : "border border-dashed border-paper/30"}`}
              >
                {s === "sent" ? "✓" : s === "fail" ? "↻" : ""}
              </span>
            );
          })}
        </div>
        <p className="text-[13px] leading-[1.5] text-paper/80">
          <b className="text-paper">{t.sheetSafe}</b> {t.sheetSafeBody}
        </p>
        <button
          type="button"
          onClick={onSendNow}
          disabled={!waiting.size}
          className="h-12 rounded-full bg-text-3 text-[15px] font-extrabold disabled:opacity-40"
        >
          {t.sendNow}
        </button>
      </div>
    </div>
  );
}

function CopyLink({ big }: { big?: boolean }) {
  const [done, setDone] = useState(false);
  const url = typeof location === "undefined" ? "" : location.href;
  const copyIt = () =>
    void navigator.clipboard?.writeText(url).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    });
  if (big) return <Primary onClick={copyIt}>{done ? t.copied : t.copyLink}</Primary>;
  return (
    <div className="mt-2 flex h-12 items-center gap-2 rounded-2xl bg-text-3 pr-1.5 pl-4">
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        type="button"
        onClick={copyIt}
        className="h-9 rounded-xl bg-paper px-3 text-[13px] font-extrabold text-ink"
      >
        {done ? t.copied : t.copy}
      </button>
    </div>
  );
}
