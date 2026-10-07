"use client";
import { type GuestMe, InstagramSchema, WhatsappSchema } from "@tetra/shared";
import { useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { dotDate, H1, Primary, TLogo } from "./ui";

const t = copy.guestCam;

/** A1 Pembuka (arah 1a): sampul acara, jatah + reveal, nama, ContactField, ConsentRow. Sekali per HP. */
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
  const after = info.reveal === "after";

  const submit = async () => {
    if (!ready || busy) return;
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
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-paper px-5 pt-[52px] pb-[calc(28px+env(safe-area-inset-bottom))] max-[380px]:pt-10">
      <div
        className="relative h-[196px] flex-none overflow-hidden rounded-[20px] border-[1.5px] border-ink bg-neutral max-[380px]:h-[150px]"
        style={
          info.branding.color && !info.coverUrl ? { background: info.branding.color } : undefined
        }
      >
        {info.coverUrl ? (
          // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan
          <img
            src={info.coverUrl}
            alt=""
            className="absolute inset-0 size-full object-cover object-[50%_22%]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-lavender px-8 text-center text-[26px] leading-tight font-extrabold tracking-[-0.03em]">
            {info.name}
          </div>
        )}
        {info.branding.tagline && (
          <span className="absolute top-3 left-3 flex h-7 items-center rounded-full border-[1.5px] border-ink bg-lavender px-3 text-xs font-bold">
            {info.branding.tagline}
          </span>
        )}
        <span className="absolute top-3 right-3">
          {info.branding.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan
            <img
              src={info.branding.logoUrl}
              alt=""
              className="h-8 max-w-[96px] rounded-[10px] border-[1.5px] border-ink bg-white object-contain p-0.5"
            />
          ) : (
            <TLogo />
          )}
        </span>
        <span className="absolute bottom-3 left-3 flex h-7 items-center rounded-full border-[1.5px] border-ink bg-white px-3 font-mono text-xs">
          {dotDate(info.date)}
        </span>
      </div>

      <H1 className="mt-[18px]">{t.invite(info.name)}</H1>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="flex h-[30px] items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-mint-soft px-3 text-xs font-bold">
          <span className="font-mono text-[13px] font-medium">{info.shots}</span> {t.perHp}
        </span>
        <span
          className={`flex h-[30px] items-center rounded-full border-[1.5px] border-ink px-3 text-xs font-bold ${after ? "bg-peach" : "bg-sky"}`}
        >
          {after ? t.revealAfter : t.revealLive}
        </span>
      </div>

      <form
        className="mt-[22px] flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={t.namePh}
          placeholder={t.namePh}
          autoComplete="name"
          maxLength={80}
          className="h-12 w-full rounded-[12px] border-[1.5px] border-ink bg-white px-3.5 text-[15px] font-semibold outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
        />
        {/* ContactField: segmented WhatsApp | Instagram di atas satu input. */}
        <div className="flex flex-col gap-2">
          <div className="flex h-11 overflow-hidden rounded-[12px] border-[1.5px] border-ink bg-white">
            {(["whatsapp", "instagram"] as const).map((v, i) => (
              <button
                key={v}
                type="button"
                aria-pressed={via === v}
                onClick={() => {
                  setVia(v);
                  setContact("");
                  setTouched(false);
                }}
                className={`flex-1 text-sm font-bold ${i === 0 ? "border-r-[1.5px] border-ink" : ""} ${via === v ? "bg-lavender" : "bg-white"}`}
              >
                {v === "whatsapp" ? t.wa : t.ig}
              </button>
            ))}
          </div>
          <input
            key={via}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-label={via === "whatsapp" ? t.wa : t.ig}
            aria-invalid={touched && !!contact && !valid}
            placeholder={via === "whatsapp" ? t.waPh : t.igPh}
            type={via === "whatsapp" ? "tel" : "text"}
            inputMode={via === "whatsapp" ? "tel" : "text"}
            autoCapitalize="off"
            autoCorrect="off"
            className={`h-12 w-full rounded-[12px] border-[1.5px] bg-white px-3.5 font-mono text-[15px] outline-none focus:shadow-[0_0_0_3px_var(--mint)] ${touched && contact && !valid ? "border-coral-strong" : "border-ink"}`}
          />
          {touched && contact && !valid && (
            <p className="text-xs font-bold text-coral-strong">
              {via === "whatsapp" ? t.waBad : t.igBad}
            </p>
          )}
        </div>
        {/* ConsentRow: centang bulat + teks persetujuan dipotong satu baris. */}
        <div className="flex items-start gap-3 rounded-[12px] border-[1.5px] border-dashed border-ink px-3 py-[11px]">
          {/* biome-ignore lint/a11y/useSemanticElements: centang bulat custom (desain ConsentRow), aria-checked lengkap */}
          <button
            type="button"
            role="checkbox"
            aria-checked={ok}
            aria-label={info.consentText}
            onClick={() => setOk(!ok)}
            className={`flex size-6 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold text-white ${ok ? "bg-green" : "bg-white"}`}
          >
            {ok ? "✓" : ""}
          </button>
          <div className="min-w-0 flex-1 text-xs leading-[1.5] text-text-3">
            <div className={open ? "" : "line-clamp-1"}>{info.consentText}</div>
            <button type="button" onClick={() => setOpen(!open)} className="font-bold underline">
              {open ? t.readLess : t.readMore}
            </button>
          </div>
        </div>
        {error && <p className="text-sm font-bold text-coral-strong">{error}</p>}
        <button type="submit" hidden />
      </form>

      <div className="min-h-6 flex-1" />
      <Primary disabled={!ready || busy} onClick={() => void submit()}>
        {busy ? t.joining : t.start}
      </Primary>
      <p className="mt-3 text-center text-[11px] text-text-2">{t.joinFoot}</p>
    </main>
  );
}
