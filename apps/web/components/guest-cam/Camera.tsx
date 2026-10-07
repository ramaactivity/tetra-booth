"use client";
import { filterCss, PHOTO_FILTERS } from "@tetra/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { dotDate, firstName, H1, Head, Lead, Primary, Screen, Tag } from "./ui";

const t = copy.guestCam;
type Cam = "ask" | "on" | "denied" | "inapp";

/** Status kiriman dari antrean IndexedDB (UploadPill & sheet A6b). */
export type Upload = { sent: number[]; waiting: number[]; failing: boolean; online: boolean };

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Nama aplikasi kalau dibuka dari browser dalam aplikasi (A2c). */
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

/**
 * A2 izin kamera (a/b/c) + A3 kamera (arah 1b) + A4 setelah jepret + A6 kiriman. Pratinjau filter lewat CSS;
 * piksel yang diunggah diproses applyPhotoFilter di capture.ts. Jeda rana 380 ms, kilat 150 ms, film maju 300 ms.
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
  /** Object URL jepretan terakhir (reveal live), atau null. */
  lastThumb: string | null;
  onShot: (video: HTMLVideoElement, filter: string) => Promise<void>;
  onMine: () => void;
  onSendNow: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<Cam>("ask");
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [fi, setFi] = useState(0);
  const [press, setPress] = useState(false);
  const [flash, setFlash] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [fly, setFly] = useState<{ n: number; img: string | null } | null>(null);
  const [sheet, setSheet] = useState(false);
  const [os, setOs] = useState<"ios" | "android">(() =>
    typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent) ? "android" : "ios",
  );
  const swipe = useRef<number | null>(null);
  const filters = info.filters;
  const filter = filters[fi] ?? "normal";
  const after = info.reveal === "after";
  const app = inAppName();

  const start = useCallback(
    async (face: "user" | "environment") => {
      for (const tr of stream.current?.getTracks() ?? []) tr.stop();
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1080 } },
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

  // Izin sudah pernah diberikan → langsung nyala (Safari tanpa Permissions API: tetap layar A2a).
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

  const shoot = async () => {
    const v = video.current;
    if (!v || press || left <= 0 || cam !== "on") return;
    const rm = reduced();
    setPress(true);
    await new Promise((r) => setTimeout(r, rm ? 0 : 380));
    if (!rm) setFlash(true);
    setTimeout(() => setFlash(false), 150);
    try {
      await onShot(v, filter);
      setToast(
        rm
          ? t.saved
          : after
            ? t.toastAfter
            : info.approval === "manual"
              ? t.toastReview
              : t.toastLive,
      );
      if (!rm) {
        setFly({ n: used + 1, img: null });
        setTimeout(() => setFly(null), 320);
      }
    } finally {
      setPress(false);
    }
  };
  const step = (d: number) => setFi((i) => (i + d + filters.length) % filters.length);

  if (cam !== "on") {
    const head = <Head title={info.name} sub={dotDate(info.date)} />;
    if (cam === "ask")
      return (
        <Screen
          bottom={
            <>
              <Primary onClick={() => void start(facing)}>{t.askOpen}</Primary>
              <p className="text-center text-xs text-text-2">{t.askNote}</p>
            </>
          }
        >
          {head}
          <div className="mt-14 flex size-[76px] items-center justify-center rounded-[18px] border-[1.5px] border-dashed border-ink bg-peach max-[380px]:mt-8">
            <svg
              width="34"
              height="34"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </div>
          <H1 className="mt-[22px]">{t.askTitle(firstName(name))}</H1>
          <Lead>{t.askBody}</Lead>
          <div
            className="mt-[26px] flex flex-col gap-3.5 rounded-2xl border-[1.5px] border-ink bg-white p-4"
            aria-hidden
          >
            <div className="text-[13px] leading-[1.45] font-semibold">
              <span className="font-mono font-medium">booth.tetraphoto.com</span> {t.askWants}
            </div>
            <div className="flex gap-2.5">
              <div className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-line-soft text-[13px] font-bold text-muted">
                {t.askBlock}
              </div>
              <div className="flex h-10 flex-1 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-mint-soft text-[13px] font-extrabold shadow-[0_0_0_3px_var(--mint)]">
                {t.askAllow}
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-text-2">{t.askSample}</p>
        </Screen>
      );
    if (cam === "inapp")
      return (
        <Screen bottom={<CopyLink big />}>
          {head}
          <div className="mt-10">
            <Tag bg="bg-sky">{t.inAppPill(app ?? "aplikasi")}</Tag>
          </div>
          <H1 className="mt-4">{t.inAppTitle}</H1>
          <Lead>{t.inAppBody(app ?? "aplikasi")}</Lead>
          <ol className="mt-[22px] overflow-hidden rounded-2xl border-[1.5px] border-ink bg-white">
            <li className="flex items-center gap-3 border-b-[1.5px] border-dashed border-ink px-4 py-3.5 text-sm font-semibold">
              <span className="flex size-[30px] flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-ink font-mono text-[13px] text-white">
                1
              </span>
              <span>
                {t.inAppStep1[0]}{" "}
                <span className="inline-flex h-[22px] items-center rounded-md border-[1.5px] border-ink px-[7px] align-middle font-extrabold">
                  ⋯
                </span>{" "}
                {t.inAppStep1[1]}
              </span>
            </li>
            <li className="flex items-center gap-3 px-4 py-3.5 text-sm font-semibold">
              <span className="flex size-[30px] flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-white font-mono text-[13px]">
                2
              </span>
              <span>
                Pilih <b>{t.inAppStep2}</b>
              </span>
            </li>
          </ol>
          <p className="mt-[22px] text-xs font-bold">{t.copyHint}</p>
          <CopyLink />
        </Screen>
      );
    const steps = os === "ios" ? t.stepsIos : t.stepsAndroid;
    return (
      <Screen bottom={<Primary onClick={() => location.reload()}>{t.retry}</Primary>}>
        {head}
        <div className="mt-10">
          <Tag bg="bg-coral">{t.deniedPill}</Tag>
        </div>
        <H1 className="mt-4">{t.deniedTitle}</H1>
        <Lead>{t.deniedBody}</Lead>
        <div className="mt-[22px] flex h-11 overflow-hidden rounded-[12px] border-[1.5px] border-ink bg-white">
          {(["ios", "android"] as const).map((o, i) => (
            <button
              key={o}
              type="button"
              aria-pressed={os === o}
              onClick={() => setOs(o)}
              className={`flex-1 text-sm font-bold ${i === 0 ? "border-r-[1.5px] border-ink" : ""} ${os === o ? "bg-lavender" : "bg-white"}`}
            >
              {o === "ios" ? t.iphone : t.android}
            </button>
          ))}
        </div>
        <ol className="mt-[22px] flex flex-col">
          {steps.map((s, i) => (
            <li key={s} className="flex gap-3.5">
              <div className="flex flex-none flex-col items-center">
                <span
                  className={`flex size-8 items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[13px] ${i === 0 ? "bg-ink text-white" : "bg-white"}`}
                >
                  {i + 1}
                </span>
                <span
                  className={`min-h-3.5 flex-1 border-l-[1.5px] border-dashed ${i < steps.length - 1 ? "border-ink" : "border-transparent"}`}
                />
              </div>
              <span className="pt-[5px] pb-[18px] text-sm leading-[1.45] font-semibold">{s}</span>
            </li>
          ))}
        </ol>
      </Screen>
    );
  }

  const pending = upload.waiting.length;
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-ink">
      <div
        className="relative min-h-0 flex-1 overflow-hidden rounded-b-[26px] bg-text-3"
        onPointerDown={(e) => {
          swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipe.current === null || filters.length < 2) return;
          const d = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(d) > 40) step(d < 0 ? 1 : -1);
        }}
      >
        <video
          ref={video}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 size-full object-cover transition-[filter] duration-200"
          style={{
            filter: filterCss(filter),
            transform: facing === "user" ? "scaleX(-1)" : undefined,
          }}
        />
        {flash && (
          <div className="pointer-events-none absolute inset-0 bg-white motion-safe:animate-[flash_.15s_ease-out_forwards]" />
        )}
        <div className="absolute inset-x-3.5 top-[50px] flex items-center justify-between gap-2 max-[380px]:top-10">
          <span className="flex h-8 min-w-0 items-center truncate rounded-full border-[1.5px] border-ink bg-white px-3 text-xs font-bold">
            {firstName(name)} · {info.name}
          </span>
          {/* UploadPill */}
          <button
            type="button"
            onClick={() => setSheet(true)}
            className={`flex h-8 flex-none items-center gap-1.5 rounded-full border-[1.5px] border-ink px-2.5 text-xs font-bold whitespace-nowrap ${!pending ? "bg-mint-soft" : upload.failing && upload.online ? "bg-coral" : "bg-peach shadow-[3px_3px_0_0_var(--ink)]"}`}
          >
            {!pending ? (
              <span className="size-2 rounded-full border-[1.5px] border-ink bg-green" />
            ) : upload.failing && upload.online ? (
              <span className="text-[11px]">↻</span>
            ) : (
              <span className="size-2 rounded-full border-[1.5px] border-dashed border-ink" />
            )}
            {!pending
              ? t.safe
              : !upload.online
                ? t.waiting(pending)
                : upload.failing
                  ? t.failing(pending)
                  : t.sending(pending)}
          </button>
        </div>
        {toast && (
          <div
            role="status"
            className={`absolute top-[100px] left-1/2 flex h-[38px] -translate-x-1/2 items-center gap-2 rounded-full border-[1.5px] border-ink px-3.5 text-[13px] font-extrabold whitespace-nowrap motion-safe:animate-[fade_.15s_ease-out] max-[380px]:top-[84px] ${after ? "bg-peach" : "bg-mint-soft"}`}
          >
            {!after && (
              <span className="flex size-[18px] items-center justify-center rounded-full border-[1.5px] border-ink bg-green text-[10px] text-white">
                ✓
              </span>
            )}
            {toast}
          </div>
        )}
        {/* ShotFlyout: kartu miring melayang ke jendela film. */}
        {fly && (
          <div
            className={`pointer-events-none absolute bottom-[-30px] left-1/2 flex h-24 w-[78px] -translate-x-1/2 -rotate-[7deg] items-center justify-center rounded-[10px] border-[1.5px] border-ink font-mono text-[13px] motion-safe:animate-[fade_.3s_ease-out] ${after ? "bg-ink text-paper" : "bg-white"}`}
          >
            {String(fly.n).padStart(2, "0")}
          </div>
        )}
        {/* FilterPill: ‹ label ›, juga bisa digeser di viewfinder. */}
        {filters.length > 1 && (
          <div className="absolute bottom-4 left-1/2 flex h-11 -translate-x-1/2 items-center overflow-hidden rounded-full border-[1.5px] border-ink bg-white">
            <button
              type="button"
              aria-label={t.prevFilter}
              onClick={() => step(-1)}
              className="flex size-11 items-center justify-center border-r-[1.5px] border-ink text-lg font-extrabold"
            >
              ‹
            </button>
            <span className="w-[124px] text-center text-sm font-extrabold" aria-live="polite">
              {PHOTO_FILTERS.find((f) => f.id === filter)?.label ?? filter}
            </span>
            <button
              type="button"
              aria-label={t.nextFilter}
              onClick={() => step(1)}
              className="flex size-11 items-center justify-center border-l-[1.5px] border-ink text-lg font-extrabold"
            >
              ›
            </button>
          </div>
        )}
      </div>

      <div className="flex h-[226px] flex-none flex-col items-center gap-3.5 pt-4 pb-[env(safe-area-inset-bottom)]">
        {/* FilmCounter: pita tick bergeser −16 px per jepretan, jendela putih angka sisa. */}
        <div className="relative flex h-12 w-full justify-center overflow-hidden">
          <div
            className="absolute top-[19px] -left-10 h-2.5 w-[1200px] opacity-90 transition-transform duration-300 ease-out motion-reduce:transition-none"
            style={{
              transform: `translateX(${-used * 16}px)`,
              background:
                "repeating-linear-gradient(90deg, var(--paper) 0 2px, transparent 2px 16px)",
            }}
          />
          {left <= 3 && left > 0 && (
            <span className="absolute top-2 left-[calc(50%+54px)] z-10 flex h-8 items-center rounded-full border-[1.5px] border-ink bg-peach px-2.5 font-mono text-xs font-medium whitespace-nowrap motion-safe:animate-[fade_.2s_ease-out]">
              {t.few(left)}
            </span>
          )}
          <div className="relative flex h-12 w-[86px] items-center justify-center rounded-[12px] bg-paper">
            <span
              key={left}
              className="font-mono text-[30px] leading-none font-medium motion-safe:animate-[tick_.3s_ease-out]"
            >
              {left > 0 ? left : "00"}
            </span>
          </div>
        </div>
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center px-[26px]">
          {/* LastShot */}
          <button
            type="button"
            aria-label={t.lastShot}
            onClick={onMine}
            className="relative size-[54px] justify-self-start overflow-hidden rounded-[14px] border-[1.5px] border-paper bg-text-3"
          >
            {lastThumb && !after ? (
              // biome-ignore lint/performance/noImgElement: object URL lokal
              <img src={lastThumb} alt="" className="size-full object-cover" />
            ) : used > 0 ? (
              <span className="absolute inset-1 flex items-center justify-center rounded-[9px] border-[1.5px] border-dashed border-paper font-mono text-[15px] text-paper">
                {used}
              </span>
            ) : null}
          </button>
          <button
            type="button"
            aria-label={t.shutter}
            disabled={left <= 0 || press}
            onClick={() => void shoot()}
            className="flex size-24 items-center justify-center rounded-full border-2 border-paper"
          >
            <span
              className={`size-20 rounded-full border-[1.5px] border-ink transition-transform duration-[120ms] ease-out ${left <= 0 ? "bg-neutral" : "bg-butter"} ${press ? "scale-[.88]" : ""}`}
            />
          </button>
          <button
            type="button"
            aria-label={t.flip}
            onClick={() => {
              const f = facing === "user" ? "environment" : "user";
              setFacing(f);
              void start(f);
            }}
            className="flex size-[54px] items-center justify-center justify-self-end rounded-full border-[1.5px] border-paper bg-text-3"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--paper)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M11 19H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
              <path d="M13 5h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-5" />
              <circle cx="12" cy="12" r="3" />
              <path d="m18 22-3-3 3-3" />
              <path d="m6 2 3 3-3 3" />
            </svg>
          </button>
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

/** A6b: status tiap jepretan (terkirim / menunggu / gagal) + "Kirim sekarang". */
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
      className="fixed inset-0 z-30 mx-auto flex max-w-[480px] items-end p-2.5"
      role="dialog"
      aria-label={t.sheetTitle}
    >
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative flex w-full flex-col gap-4 rounded-[28px] border-[1.5px] border-ink bg-white px-5 pt-2.5 pb-[calc(22px+env(safe-area-inset-bottom))] motion-safe:animate-[enter_.25s_ease-out]">
        <span className="h-1 w-9 self-center rounded-full bg-ink" />
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-extrabold tracking-[-0.02em]">{t.sheetTitle}</h2>
            <p className="mt-1 text-[13px] text-text-2">{waiting.size ? t.sheetWeak : t.sheetOk}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="flex size-8 items-center justify-center rounded-full border-[1.5px] border-ink text-sm font-extrabold"
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
                className={`flex aspect-square items-center justify-center rounded-[7px] border-[1.5px] border-ink font-mono text-[10px] ${s === "sent" ? "bg-mint" : s === "wait" ? "border-dashed bg-peach" : s === "fail" ? "bg-coral" : "border-dashed"}`}
              >
                {s === "sent" ? "✓" : s === "fail" ? "↻" : ""}
              </span>
            );
          })}
        </div>
        <ul className="flex flex-col gap-2 text-[13px]">
          <li className="flex items-center gap-2.5">
            <span className="size-4 flex-none rounded-[5px] border-[1.5px] border-ink bg-mint" />
            <span className="w-4 font-mono">{sent.size}</span>
            {t.sheetSent}
          </li>
          <li className="flex items-center gap-2.5">
            <span
              className={`size-4 flex-none rounded-[5px] border-[1.5px] border-dashed border-ink ${failed ? "bg-coral" : "bg-peach"}`}
            />
            <span className="w-4 font-mono">{waiting.size}</span>
            {failed ? t.sheetFailed : t.sheetWaiting}
          </li>
        </ul>
        <div className="rounded-[12px] border-[1.5px] border-dashed border-ink bg-sky px-3.5 py-3 text-[13px] leading-[1.5]">
          <b>{t.sheetSafe}</b> {t.sheetSafeBody}
        </div>
        <button
          type="button"
          onClick={onSendNow}
          disabled={!waiting.size}
          className="layered pressable flex h-[52px] items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white text-[15px] font-extrabold [--lb:1.5px] [--lx:4px] [--under:#fff] disabled:opacity-50"
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
  if (big) return <Primary onClick={copyIt}>{t.copyLink}</Primary>;
  return (
    <div className="mt-2 flex h-12 items-center gap-2 rounded-[12px] border-[1.5px] border-ink bg-white pr-1.5 pl-3.5">
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">
        {url.replace(/^https?:\/\//, "")}
      </span>
      <button
        type="button"
        onClick={copyIt}
        className={`flex h-9 items-center rounded-[9px] border-[1.5px] border-ink px-3 text-[13px] font-extrabold ${done ? "bg-mint-soft" : "bg-white"}`}
      >
        {done ? t.copied : t.copy}
      </button>
    </div>
  );
}
