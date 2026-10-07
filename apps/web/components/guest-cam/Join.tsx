"use client";
import { type GuestMe, InstagramSchema, WhatsappSchema } from "@tetra/shared";
import { Camera as CameraIcon, Check, Compass, Share, SquarePlus, X } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { CameraArt } from "./CameraArt";
import { dotDate, goFullscreen, Primary } from "./ui";

const t = copy.guestCam;
const field =
  "h-[52px] w-full rounded-2xl bg-white/10 px-4 text-base text-paper outline-none placeholder:text-white/40 focus:bg-white/15 focus:shadow-[0_0_0_2px_var(--butter)]";

/** Lubang sprocket film di tepi kiri/kanan pembuka. */
function Sprockets({ side }: { side: "left" | "right" }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 w-[18px] bg-black ${side === "left" ? "left-0" : "right-0"}`}
    >
      <div
        className="absolute inset-x-[5px] inset-y-0"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0 6px, rgba(248,247,244,.82) 6px 16px, transparent 16px 24px)",
        }}
      />
    </div>
  );
}

/** Satu langkah panduan Layar Utama. */
function Step({
  n,
  icon,
  children,
}: {
  n: number;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3.5">
      <span className="flex size-8 flex-none items-center justify-center rounded-full bg-white/10 font-mono text-sm">
        {n}
      </span>
      <span className="flex-1 text-[15px] leading-snug">{children}</span>
      <span className="flex size-11 flex-none items-center justify-center rounded-2xl bg-white/10">
        {icon}
      </span>
    </li>
  );
}

/** iPhone/iPad di Safari (bukan dari ikon Layar Utama): tawarkan pasang ke Layar Utama supaya layar penuh. */
const wantsA2hs = () => {
  if (typeof navigator === "undefined") return false;
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches;
  try {
    return ios && !standalone && localStorage.getItem("gc-a2hs-skip") !== "1";
  } catch {
    return ios && !standalone;
  }
};

/**
 * Pembuka v3 (#209): sampul layar penuh (zoom pelan) berbingkai film, judul & kamera muncul berurutan, satu tombol
 * "Ikut motret" yang membuka lembar form dari bawah. Sekali isi per HP.
 */
export function Join({
  token,
  info,
  onJoined,
}: {
  token: string;
  info: GuestInfo;
  onJoined: (me: GuestMe) => void;
}) {
  const [sheet, setSheet] = useState(false);
  const [a2hs, setA2hs] = useState(false);
  const [name, setName] = useState("");
  const [via, setVia] = useState<"whatsapp" | "instagram">("whatsapp");
  const [contact, setContact] = useState("");
  const [touched, setTouched] = useState(false);
  const [ok, setOk] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = (via === "whatsapp" ? WhatsappSchema : InstagramSchema).safeParse(contact).success;
  const ready = name.trim().length >= 2 && valid && ok;
  const rise = (ms: number) => ({ animationDelay: `${ms}ms` });

  const submit = async () => {
    if (!ready || busy) return;
    goFullscreen();
    setBusy(true);
    setError(null);
    const r = await fetch(`/api/c/${encodeURIComponent(token)}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), [via]: contact, consent: true }),
    }).catch(() => null);
    setBusy(false);
    if (r?.ok) return onJoined((await r.json()) as GuestMe);
    setError(t.failed);
  };

  return (
    <main className="relative mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black text-paper">
      {/* Sampul berbingkai film */}
      <div className="absolute inset-0 overflow-hidden">
        {info.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan
          <img
            src={info.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover object-[50%_25%] motion-safe:animate-[kenburns_14s_ease-out_both]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: info.branding.color ?? "#2a2926" }}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.55),rgba(0,0,0,.05)_30%,rgba(0,0,0,.25)_55%,rgba(0,0,0,.95)_88%)]" />
        <Sprockets side="left" />
        <Sprockets side="right" />
      </div>

      <div className="relative flex flex-1 flex-col px-9 pt-[max(18px,env(safe-area-inset-top))] pb-[max(22px,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between font-mono text-[11px] tracking-[0.18em] text-[#FF9A3C] uppercase motion-safe:animate-[rise_.6s_ease-out_both]">
          <span>Tetra 400</span>
          <span>{dotDate(info.date)}</span>
        </div>

        <div className="flex-1" />

        <div
          className="flex items-end gap-2 motion-safe:animate-[rise_.7s_ease-out_both]"
          style={rise(250)}
        >
          <span className="-rotate-12">
            <CameraArt id="disposable" body="#8EDCCB" size={58} />
          </span>
          <span className="-translate-y-2">
            <CameraArt id="instant" body="#CEC8F6" size={66} />
          </span>
          <span className="rotate-12">
            <CameraArt id="gold" body="#F8D98B" size={58} />
          </span>
        </div>
        {info.branding.tagline && (
          <p
            className="mt-5 text-xs font-bold tracking-[0.16em] text-paper/75 uppercase motion-safe:animate-[rise_.6s_ease-out_both]"
            style={rise(380)}
          >
            {info.branding.tagline}
          </p>
        )}
        <h1
          className="mt-2 text-[44px] leading-[0.98] font-extrabold tracking-[-0.045em] text-balance max-[380px]:text-[38px] motion-safe:animate-[rise_.7s_ease-out_both]"
          style={rise(450)}
        >
          {info.name}
        </h1>
        <p
          className="mt-3 max-w-[300px] text-[15px] leading-snug text-paper/80 motion-safe:animate-[rise_.7s_ease-out_both]"
          style={rise(560)}
        >
          {t.heroLine}
        </p>
        <div
          className="mt-4 flex flex-wrap gap-2 motion-safe:animate-[rise_.7s_ease-out_both]"
          style={rise(640)}
        >
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
            <b className="font-mono">{info.shots}</b> {t.perHp}
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold">
            {info.reveal === "after" ? t.revealAfter : t.revealLive}
          </span>
        </div>
        <div className="mt-7 motion-safe:animate-[rise_.7s_ease-out_both]" style={rise(760)}>
          <Primary
            onClick={() => {
              goFullscreen();
              if (wantsA2hs()) setA2hs(true);
              else setSheet(true);
            }}
            className="h-[60px] text-[17px]"
          >
            <CameraIcon size={20} strokeWidth={2.4} /> {t.join}
          </Primary>
          <p className="mt-3 text-center text-[11px] text-paper/50">{t.joinFoot}</p>
        </div>
      </div>

      {/* Panduan Tambah ke Layar Utama (iPhone, #211): iOS tidak mengizinkan pasang otomatis. */}
      <div
        className={`absolute inset-0 z-30 transition-opacity duration-200 ${a2hs ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!a2hs}
        role="dialog"
        aria-label={t.a2hsTitle}
      >
        <div className="absolute inset-0 bg-black/60" />
        <div
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-4 rounded-t-[30px] bg-[#151514] px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${a2hs ? "translate-y-0" : "translate-y-full"}`}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/25" />
          <div className="flex items-center gap-3.5">
            {/* biome-ignore lint/performance/noImgElement: ikon statis kecil */}
            <img src="/guest-cam/apple-touch-icon.png" alt="" className="size-14 rounded-[14px]" />
            <div>
              <h2 className="text-xl leading-tight font-extrabold">{t.a2hsTitle}</h2>
              <p className="mt-1 text-[13px] text-paper/70">{t.a2hsBody}</p>
            </div>
          </div>
          <ol className="flex flex-col gap-3">
            <Step n={1} icon={<Share size={22} className="text-[#3B9BFF]" />}>
              {t.a2hsStep1[0]} <b>{t.a2hsStep1[1]}</b> {t.a2hsStep1[2]}
            </Step>
            <Step n={2} icon={<SquarePlus size={22} />}>
              {t.a2hsStep2[0]} <b>{t.a2hsStep2[1]}</b>
            </Step>
            <Step
              n={3}
              icon={
                // biome-ignore lint/performance/noImgElement: ikon statis kecil
                <img src="/guest-cam/apple-touch-icon.png" alt="" className="size-8 rounded-lg" />
              }
            >
              {t.a2hsStep3[0]} <b>{t.a2hsStep3[1]}</b> {t.a2hsStep3[2]}
            </Step>
          </ol>
          <p className="flex items-center gap-2 rounded-2xl bg-white/5 px-3.5 py-2.5 text-xs text-paper/70">
            <Compass size={16} className="flex-none" /> {t.a2hsWa}
          </p>
          <Primary tabIndex={a2hs ? 0 : -1} onClick={() => setA2hs(false)}>
            {t.a2hsOk}
          </Primary>
          <button
            type="button"
            tabIndex={a2hs ? 0 : -1}
            onClick={() => {
              try {
                localStorage.setItem("gc-a2hs-skip", "1");
              } catch {}
              setA2hs(false);
              setSheet(true);
            }}
            className="min-h-11 text-sm font-bold text-paper/70 underline underline-offset-4"
          >
            {t.a2hsSkip}
          </button>
        </div>
      </div>

      {/* Lembar form */}
      <div
        className={`absolute inset-0 z-20 transition-opacity duration-200 ${sheet ? "opacity-100" : "pointer-events-none opacity-0"}`}
        aria-hidden={!sheet}
      >
        <button
          type="button"
          tabIndex={sheet ? 0 : -1}
          aria-label="Tutup"
          onClick={() => setSheet(false)}
          className="absolute inset-0 bg-black/55"
        />
        <form
          className={`absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-[30px] bg-[#151514] px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))] transition-transform duration-300 ease-out ${sheet ? "translate-y-0" : "translate-y-full"}`}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="mx-auto h-1 w-10 rounded-full bg-white/25" />
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{t.formTitle}</h2>
            <button
              type="button"
              tabIndex={sheet ? 0 : -1}
              onClick={() => setSheet(false)}
              aria-label="Tutup"
              className="flex size-9 items-center justify-center rounded-full bg-white/10"
            >
              <X size={18} />
            </button>
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label={t.namePh}
            placeholder={t.namePh}
            autoComplete="name"
            maxLength={80}
            tabIndex={sheet ? 0 : -1}
            className={`${field} font-semibold`}
          />
          <div className="flex gap-2">
            <div className="flex h-[52px] flex-none rounded-2xl bg-white/10 p-1">
              {(["whatsapp", "instagram"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  tabIndex={sheet ? 0 : -1}
                  aria-pressed={via === v}
                  aria-label={v === "whatsapp" ? t.wa : t.ig}
                  onClick={() => {
                    setVia(v);
                    setContact("");
                    setTouched(false);
                  }}
                  className={`rounded-xl px-3 text-[13px] font-extrabold transition ${via === v ? "bg-paper text-ink" : "text-paper/70"}`}
                >
                  {v === "whatsapp" ? "WA" : "IG"}
                </button>
              ))}
            </div>
            <input
              key={via}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              onBlur={() => setTouched(true)}
              tabIndex={sheet ? 0 : -1}
              aria-label={via === "whatsapp" ? `Nomor ${t.wa}` : `Akun ${t.ig}`}
              aria-invalid={touched && !!contact && !valid}
              placeholder={via === "whatsapp" ? t.waPh : t.igPh}
              type={via === "whatsapp" ? "tel" : "text"}
              inputMode={via === "whatsapp" ? "tel" : "text"}
              autoCapitalize="off"
              autoCorrect="off"
              className={`${field} min-w-0 font-mono ${touched && contact && !valid ? "shadow-[0_0_0_2px_var(--coral-strong)]" : ""}`}
            />
          </div>
          {touched && contact && !valid && (
            <p className="text-xs font-bold text-coral">{via === "whatsapp" ? t.waBad : t.igBad}</p>
          )}
          <div className="flex items-start gap-3 rounded-2xl bg-white/5 px-3.5 py-3">
            {/* biome-ignore lint/a11y/useSemanticElements: centang bulat custom, aria-checked lengkap */}
            <button
              type="button"
              role="checkbox"
              tabIndex={sheet ? 0 : -1}
              aria-checked={ok}
              aria-label={info.consentText}
              onClick={() => setOk(!ok)}
              className={`mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border-2 transition ${ok ? "border-butter bg-butter text-ink" : "border-white/40"}`}
            >
              {ok && <Check size={14} strokeWidth={3} />}
            </button>
            <div className="min-w-0 flex-1 text-xs leading-[1.5] text-paper/70">
              <div className={open ? "" : "line-clamp-2"}>{info.consentText}</div>
              <button
                type="button"
                tabIndex={sheet ? 0 : -1}
                onClick={() => setOpen(!open)}
                className="font-bold text-paper underline"
              >
                {open ? t.readLess : t.readMore}
              </button>
            </div>
          </div>
          {error && <p className="text-sm font-bold text-coral">{error}</p>}
          <Primary
            type="submit"
            tabIndex={sheet ? 0 : -1}
            disabled={!ready || busy}
            className="mt-1"
          >
            {busy ? t.joining : t.start}
          </Primary>
        </form>
      </div>
    </main>
  );
}
