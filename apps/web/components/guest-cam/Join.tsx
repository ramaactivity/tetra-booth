"use client";
import { type GuestMe, InstagramSchema, WhatsappSchema } from "@tetra/shared";
import { useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { dotDate, goFullscreen, Primary } from "./ui";

const t = copy.guestCam;
const field =
  "h-[52px] w-full rounded-2xl bg-text-3 px-4 text-base text-paper outline-none placeholder:text-muted focus:shadow-[0_0_0_2px_var(--butter)]";

/** Pembuka v2 (#209): sampul acara penuh, form ringkas di bawah. Sekali isi per HP. */
export function Join({
  token,
  info,
  onJoined,
}: {
  token: string;
  info: GuestInfo;
  onJoined: (me: GuestMe) => void;
}) {
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-black text-paper">
      <div className="relative h-[40dvh] min-h-[240px] flex-none overflow-hidden">
        {info.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan
          <img
            src={info.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover object-[50%_25%]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: info.branding.color ?? "var(--text-3)" }}
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,.35),transparent_35%,rgba(0,0,0,.9))]" />
        <div className="absolute inset-x-5 top-[max(16px,env(safe-area-inset-top))] flex items-center justify-between">
          <span className="rounded-full bg-black/55 px-3 py-1.5 font-mono text-xs">
            {dotDate(info.date)}
          </span>
          <span className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-extrabold">
            tetra · guest cam
          </span>
        </div>
        <div className="absolute inset-x-5 bottom-4">
          {info.branding.tagline && (
            <div className="text-xs font-bold tracking-[0.14em] text-paper/80 uppercase">
              {info.branding.tagline}
            </div>
          )}
          <h1 className="mt-1 text-[34px] leading-[1.02] font-extrabold tracking-[-0.04em] text-balance">
            {info.name}
          </h1>
        </div>
      </div>

      <form
        className="flex flex-1 flex-col gap-3 px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-[15px] leading-snug text-paper/75">
          {t.invite(info.name)}.{" "}
          <span className="text-paper">
            <b className="font-mono">{info.shots}</b> {t.perHp} ·{" "}
            {info.reveal === "after" ? t.revealAfter.toLowerCase() : t.revealLive.toLowerCase()}
          </span>
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t.namePh}
          placeholder={t.namePh}
          autoComplete="name"
          maxLength={80}
          className={`${field} font-semibold`}
        />
        <div className="flex gap-2">
          <div className="flex h-[52px] flex-none rounded-2xl bg-text-3 p-1">
            {(["whatsapp", "instagram"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={via === v}
                aria-label={v === "whatsapp" ? t.wa : t.ig}
                onClick={() => {
                  setVia(v);
                  setContact("");
                  setTouched(false);
                }}
                className={`rounded-xl px-3 text-[13px] font-extrabold ${via === v ? "bg-paper text-ink" : "text-paper/70"}`}
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
        <div className="flex items-start gap-3 rounded-2xl bg-text-3/60 px-3.5 py-3">
          {/* biome-ignore lint/a11y/useSemanticElements: centang bulat custom, aria-checked lengkap */}
          <button
            type="button"
            role="checkbox"
            aria-checked={ok}
            aria-label={info.consentText}
            onClick={() => setOk(!ok)}
            className={`mt-0.5 flex size-6 flex-none items-center justify-center rounded-full border-2 text-xs font-extrabold ${ok ? "border-butter bg-butter text-ink" : "border-muted"}`}
          >
            {ok ? "✓" : ""}
          </button>
          <div className="min-w-0 flex-1 text-xs leading-[1.5] text-paper/70">
            <div className={open ? "" : "line-clamp-2"}>{info.consentText}</div>
            <button
              type="button"
              onClick={() => setOpen(!open)}
              className="font-bold text-paper underline"
            >
              {open ? t.readLess : t.readMore}
            </button>
          </div>
        </div>
        {error && <p className="text-sm font-bold text-coral">{error}</p>}
        <div className="min-h-2 flex-1" />
        <Primary type="submit" disabled={!ready || busy}>
          {busy ? t.joining : t.start}
        </Primary>
        <p className="text-center text-[11px] text-muted">{t.joinFoot}</p>
      </form>
    </main>
  );
}
