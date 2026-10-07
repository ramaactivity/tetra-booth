"use client";
import { GUEST_PRESETS, guestPreset, stampText } from "@tetra/shared";
import {
  CalendarDays,
  ChevronDown,
  CloudOff,
  CloudUpload,
  Copy,
  Film,
  RefreshCw,
  SwitchCamera,
  Timer,
  TimerOff,
  X,
  Zap,
  ZapOff,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { CameraArt } from "./CameraArt";
import { firstName, goFullscreen, H1, Lead, Primary, Screen, Tag } from "./ui";

const t = copy.guestCam;
type Cam = "ask" | "starting" | "on" | "denied" | "inapp";
type Lens = { key: string; label: string; zoom?: number; deviceId?: string };

/** Status kiriman dari antrean IndexedDB (pil kanan atas & lembar status). */
export type Upload = { sent: number[]; waiting: number[]; failing: boolean; online: boolean };

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

/** Noise statis sekali buat (pratinjau grain ringan, tanpa blend mode); piksel asli diproses worker. */
let grainUrl: string | null = null;
const grain = () => {
  if (grainUrl || typeof document === "undefined") return grainUrl;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 40;
  }
  g.putImageData(img, 0, 0);
  grainUrl = c.toDataURL();
  return grainUrl;
};

/**
 * Lensa yang tersedia (#209): zoom optik bawaan (Chrome Android, mis. 0.5–10×) atau kamera terpisah menurut
 * nama perangkat (iPhone: Ultra Wide / Back / Telephoto). Kamera depan: satu lensa.
 */
async function detectLenses(
  track: MediaStreamTrack,
  facing: "user" | "environment",
): Promise<Lens[]> {
  if (facing === "user") return [];
  const z = (track.getCapabilities?.() as { zoom?: { min: number; max: number } } | undefined)
    ?.zoom;
  if (z && z.max > z.min) {
    const out: Lens[] = [];
    if (z.min < 0.95)
      out.push({ key: "uw", label: z.min <= 0.55 ? "0.5" : z.min.toFixed(1), zoom: z.min });
    out.push({ key: "1", label: "1×", zoom: Math.max(1, z.min) });
    if (z.max >= 2) out.push({ key: "2", label: "2", zoom: 2 });
    if (z.max >= 5) out.push({ key: "5", label: "5", zoom: 5 });
    return out.length > 1 ? out : [];
  }
  const devs = (await navigator.mediaDevices.enumerateDevices()).filter(
    (d) =>
      d.kind === "videoinput" &&
      /back|rear|belakang/i.test(d.label) &&
      !/dual|triple/i.test(d.label),
  );
  const uw = devs.find((d) => /ultra ?wide/i.test(d.label));
  const tele = devs.find((d) => /tele/i.test(d.label));
  const main = devs.find((d) => d !== uw && d !== tele);
  const out: Lens[] = [];
  if (uw) out.push({ key: "uw", label: "0.5", deviceId: uw.deviceId });
  if (main) out.push({ key: "1", label: "1×", deviceId: main.deviceId });
  if (tele) out.push({ key: "tele", label: "Tele", deviceId: tele.deviceId });
  return out.length > 1 ? out : [];
}

const round = "flex items-center justify-center rounded-full transition active:scale-90";

/**
 * Kamera Guest Cam v2 (#209, gaya Dazz): viewfinder 3:4, pilihan lensa, laci kamera berilustrasi (preset film
 * bahasa Inggris), flash, timer, stempel tanggal, ganti kamera depan/belakang. Pratinjau = CSS filter + overlay
 * ringan; piksel asli diproses Web Worker (capture.ts).
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
  const [cam, setCam] = useState<Cam>("starting");
  const [live, setLive] = useState(false);
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [lens, setLens] = useState("1");
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
  const noise = useMemo(() => grain(), []);

  const start = useCallback(
    async (face: "user" | "environment", deviceId?: string) => {
      setLive(false);
      for (const tr of stream.current?.getTracks() ?? []) tr.stop();
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: face }),
            width: { ideal: 1920 },
            height: { ideal: 1440 },
          },
        });
        stream.current = s;
        setCam("on");
        const track = s.getVideoTracks()[0];
        if (track && !deviceId) {
          const ls = await detectLenses(track, face).catch(() => []);
          setLenses(ls);
          setLens("1");
          const one = ls.find((l) => l.key === "1");
          if (one?.zoom)
            await track
              .applyConstraints({ advanced: [{ zoom: one.zoom } as MediaTrackConstraintSet] })
              .catch(() => {});
        }
      } catch {
        setCam(app ? "inapp" : "denied");
      }
    },
    [app],
  );

  // Pasang stream ke <video> setelah elemen ada (perbaikan: dulu kamera baru muncul setelah refresh).
  useEffect(() => {
    const v = video.current;
    if (cam !== "on" || !v || !stream.current || v.srcObject === stream.current) return;
    v.srcObject = stream.current;
    void v.play().catch(() => {});
  });

  // Izin sudah pernah diberikan → langsung nyala; belum → layar izin.
  useEffect(() => {
    let alive = true;
    const p = navigator.permissions?.query({ name: "camera" as PermissionName });
    if (!p) setCam("ask");
    else
      void p
        .then((s) => {
          if (!alive) return;
          if (s.state === "granted") void start("environment");
          else setCam(s.state === "denied" ? (app ? "inapp" : "denied") : "ask");
        })
        .catch(() => alive && setCam("ask"));
    return () => {
      alive = false;
      for (const tr of stream.current?.getTracks() ?? []) tr.stop();
    };
  }, [start, app]);

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

  const chooseLens = async (l: Lens) => {
    if (l.key === lens) return;
    setLens(l.key);
    navigator.vibrate?.(8);
    const track = stream.current?.getVideoTracks()[0];
    if (l.zoom !== undefined && track)
      await track
        .applyConstraints({ advanced: [{ zoom: l.zoom } as MediaTrackConstraintSet] })
        .catch(() => {});
    else if (l.deviceId) await start("environment", l.deviceId);
  };

  const torch = async (on: boolean) => {
    const track = stream.current?.getVideoTracks()[0];
    await track
      ?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] })
      .catch(() => {});
  };

  const shoot = async () => {
    const v = video.current;
    if (!v || busy || left <= 0 || cam !== "on" || !live) return;
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
        await sleep(260);
      } else if (flash) {
        await torch(true);
        await sleep(320);
      }
      navigator.vibrate?.(14);
      setWhite(!rm);
      setTimeout(() => setWhite(false), 140);
      await onShot(v, preset.id, stamp);
      if (flash && facing !== "user") void torch(false);
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

  if (cam !== "on" && cam !== "starting")
    return (
      <Permission
        cam={cam}
        app={app}
        os={os}
        setOs={setOs}
        name={name}
        onOpen={() => {
          goFullscreen();
          setCam("starting");
          void start(facing);
        }}
      />
    );

  const pending = upload.waiting.length;
  const failing = upload.failing && upload.online;
  const toolBtn = `${round} size-11 bg-white/10 text-paper`;
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black text-paper select-none">
      <div className="flex flex-none items-center justify-between gap-2 px-4 pt-[max(10px,env(safe-area-inset-top))] pb-2">
        <span
          className="flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3 font-mono text-sm"
          role="status"
          aria-label={`${left} foto lagi`}
        >
          <Film size={16} strokeWidth={2.2} />
          {left}
        </span>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          className="flex h-9 min-w-0 items-center gap-1 rounded-full px-3 text-[15px] font-extrabold"
        >
          <span className="truncate">{preset.name}</span>
          <ChevronDown size={16} />
        </button>
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-label={!pending ? t.safe : t.waiting(pending)}
          className={`flex h-9 flex-none items-center gap-1.5 rounded-full px-3 text-xs font-bold ${!pending ? "bg-white/10" : failing ? "bg-coral text-ink" : "bg-peach text-ink"}`}
        >
          {!upload.online && pending ? <CloudOff size={16} /> : <CloudUpload size={16} />}
          {pending ? (
            <span className="font-mono">{pending}</span>
          ) : (
            <span className="size-1.5 rounded-full bg-green" />
          )}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        <div
          className="relative aspect-[3/4] max-h-full w-full overflow-hidden rounded-[20px] bg-[#111]"
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
            onPlaying={() => setLive(true)}
            className={`absolute inset-0 size-full object-cover transition-[opacity,filter] duration-300 ${live ? "opacity-100" : "opacity-0"}`}
            style={{ filter: preset.css, transform: facing === "user" ? "scaleX(-1)" : undefined }}
          />
          {!live && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="size-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            </span>
          )}
          {preset.vignette > 0 && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${preset.vignette}))`,
              }}
            />
          )}
          {preset.grain > 0 && noise && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{ backgroundImage: `url(${noise})`, opacity: Math.min(1, preset.grain * 3) }}
            />
          )}
          {stamp && (
            <span className="pointer-events-none absolute right-[5%] bottom-[4%] font-mono text-[15px] font-semibold text-[#FF9A3C] [text-shadow:0_0_6px_rgba(255,120,30,.8)]">
              {stampText(new Date())}
            </span>
          )}
          <div
            className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-150 ${white ? "opacity-100" : "opacity-0"}`}
          />
          {count > 0 && (
            <span
              key={count}
              className="absolute inset-0 flex items-center justify-center font-mono text-[96px] font-medium [text-shadow:0_2px_12px_rgba(0,0,0,.5)] motion-safe:animate-[tick_.3s_ease-out]"
            >
              {count}
            </span>
          )}
          {badge && (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 px-4 py-2 text-lg font-extrabold motion-safe:animate-[fade_.15s_ease-out]">
              {badge}
            </span>
          )}
          {toast && (
            <span className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-4 py-2 text-[13px] font-bold whitespace-nowrap motion-safe:animate-[fade_.15s_ease-out]">
              {toast}
            </span>
          )}
          {left <= 3 && left > 0 && (
            <span className="absolute top-3 right-3 rounded-full bg-peach px-2.5 py-1 font-mono text-xs text-ink">
              {t.few(left)}
            </span>
          )}
          {lenses.length > 1 && (
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/45 p-1">
              {lenses.map((l) => (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={lens === l.key}
                  onClick={() => void chooseLens(l)}
                  className={`${round} h-9 min-w-9 px-2 font-mono text-xs font-bold ${lens === l.key ? "bg-paper text-ink" : "text-paper"}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-none items-center justify-around px-8 pt-4">
        <button
          type="button"
          aria-pressed={flash}
          aria-label="Flash"
          onClick={() => setFlash(!flash)}
          className={`${toolBtn} ${flash ? "!bg-butter !text-ink" : ""}`}
        >
          {flash ? <Zap size={20} /> : <ZapOff size={20} />}
        </button>
        <button
          type="button"
          aria-label={`Timer ${timer || "mati"}`}
          onClick={() => setTimer(timer === 0 ? 3 : timer === 3 ? 10 : 0)}
          className={`${round} h-11 min-w-11 gap-1 px-2.5 ${timer ? "bg-butter text-ink" : "bg-white/10"}`}
        >
          {timer ? <Timer size={20} /> : <TimerOff size={20} />}
          {timer > 0 && <span className="font-mono text-xs font-bold">{timer}s</span>}
        </button>
        <button
          type="button"
          aria-pressed={stamp}
          aria-label="Tanggal"
          onClick={() => setStamp(!stamp)}
          className={`${toolBtn} ${stamp ? "!bg-[#FF9A3C] !text-ink" : ""}`}
        >
          <CalendarDays size={20} />
        </button>
        <button
          type="button"
          aria-label={t.flip}
          onClick={() => {
            const f = facing === "user" ? "environment" : "user";
            setFacing(f);
            void start(f);
          }}
          className={toolBtn}
        >
          <SwitchCamera size={20} />
        </button>
      </div>

      <div className="grid flex-none grid-cols-[1fr_auto_1fr] items-center px-7 pt-4 pb-[max(18px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          aria-label={t.lastShot}
          onClick={onMine}
          className="relative size-[56px] justify-self-start overflow-hidden rounded-2xl bg-white/10 transition active:scale-90"
        >
          {lastThumb && !after ? (
            // biome-ignore lint/performance/noImgElement: object URL lokal
            <img
              key={lastThumb}
              src={lastThumb}
              alt=""
              className="size-full object-cover motion-safe:animate-[enter_.3s_ease-out]"
            />
          ) : used > 0 ? (
            <span className="absolute inset-1.5 flex items-center justify-center rounded-xl border-[1.5px] border-dashed border-paper/50 font-mono text-sm">
              {used}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          aria-label={t.shutter}
          disabled={left <= 0 || busy || !live}
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
          className="justify-self-end transition active:scale-90"
        >
          <CameraArt id={preset.id} body={preset.body} size={62} />
        </button>
      </div>

      {/* Laci kamera: selalu ter-render, meluncur dengan transform supaya halus. */}
      <div
        className={`fixed inset-0 z-30 mx-auto max-w-[480px] transition-opacity duration-200 ${drawer ? "opacity-100" : "pointer-events-none opacity-0"}`}
        role="dialog"
        aria-label="Pilih kamera"
        aria-hidden={!drawer}
      >
        <button
          type="button"
          aria-label={t.close}
          tabIndex={drawer ? 0 : -1}
          onClick={() => setDrawer(false)}
          className="absolute inset-0 bg-black/50"
        />
        <div
          className={`absolute inset-x-0 bottom-0 rounded-t-[28px] bg-[#151514] pt-3 pb-[max(20px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${drawer ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />
          <div className="flex items-center justify-between px-5 pb-1">
            <span className="text-[15px] font-extrabold">Cameras</span>
            <button
              type="button"
              tabIndex={drawer ? 0 : -1}
              onClick={() => setDrawer(false)}
              aria-label={t.close}
              className={`${round} size-9 bg-white/10`}
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex snap-x gap-1 overflow-x-auto px-3 pt-1 pb-2 [scrollbar-width:none]">
            {GUEST_PRESETS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                tabIndex={drawer ? 0 : -1}
                aria-pressed={i === pi}
                onClick={() => {
                  pick(i);
                  setDrawer(false);
                }}
                className="flex w-[86px] flex-none snap-start flex-col items-center gap-1.5 py-2 transition active:scale-95"
              >
                <CameraArt id={p.id} body={p.body} size={70} />
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap ${i === pi ? "bg-paper text-ink" : "text-paper/75"}`}
                >
                  {p.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
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
        <div className="mt-[14dvh] flex justify-center motion-safe:animate-[enter_.4s_ease-out]">
          <CameraArt id="disposable" body="#8EDCCB" size={128} />
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
            {t.inAppStep1[0]} <span className="rounded-md bg-white/10 px-2 font-extrabold">⋯</span>{" "}
            {t.inAppStep1[1]}
          </li>
          <li className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-white/10 font-mono text-sm">
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
    <Screen
      bottom={
        <Primary onClick={() => location.reload()}>
          <RefreshCw size={18} /> {t.retry}
        </Primary>
      }
    >
      <div className="mt-[10dvh]">
        <Tag bg="bg-coral">{t.deniedPill}</Tag>
      </div>
      <H1 className="mt-4">{t.deniedTitle}</H1>
      <Lead>{t.deniedBody}</Lead>
      <div className="mt-6 flex h-11 rounded-full bg-white/10 p-1">
        {(["ios", "android"] as const).map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={os === o}
            onClick={() => setOs(o)}
            className={`flex-1 rounded-full text-sm font-bold transition ${os === o ? "bg-paper text-ink" : "text-paper/70"}`}
          >
            {o === "ios" ? t.iphone : t.android}
          </button>
        ))}
      </div>
      <ol className="mt-6 flex flex-col gap-4">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3.5 text-[15px] leading-snug font-semibold">
            <span
              className={`flex size-8 flex-none items-center justify-center rounded-full font-mono text-sm ${i === 0 ? "bg-paper text-ink" : "bg-white/10"}`}
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
      <div className="relative flex w-full flex-col gap-4 rounded-t-[28px] bg-[#151514] px-5 pt-3 pb-[max(22px,env(safe-area-inset-bottom))] text-paper motion-safe:animate-[enter_.2s_ease-out]">
        <div className="mx-auto h-1 w-10 rounded-full bg-white/25" />
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold">{t.sheetTitle}</h2>
            <p className="mt-1 text-[13px] text-muted">{waiting.size ? t.sheetWeak : t.sheetOk}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className={`${round} size-9 bg-white/10`}
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-8 gap-1.5" aria-hidden>
          {Array.from({ length: shots }, (_, n) => n).map((i) => {
            const s = sent.has(i) ? "sent" : waiting.has(i) ? (failed ? "fail" : "wait") : "none";
            return (
              <span
                key={i}
                className={`flex aspect-square items-center justify-center rounded-lg font-mono text-[10px] ${s === "sent" ? "bg-mint text-ink" : s === "wait" ? "bg-peach text-ink" : s === "fail" ? "bg-coral text-ink" : "border border-dashed border-white/25"}`}
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
          className="h-12 rounded-full bg-white/10 text-[15px] font-extrabold disabled:opacity-40"
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
  if (big)
    return (
      <Primary onClick={copyIt}>
        <Copy size={18} /> {done ? t.copied : t.copyLink}
      </Primary>
    );
  return (
    <div className="mt-2 flex h-12 items-center gap-2 rounded-2xl bg-white/10 pr-1.5 pl-4">
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
