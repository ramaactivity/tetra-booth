"use client";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestPromo as Promo, Proof } from "@/lib/promo";

const t = copy.promo;
/** Lead & kode tersimpan per org di browser ini: buka lagi = langsung ke langkah berikutnya. */
const KEY = "tetra-promo";
/** Pop-up otomatis setelah simpan foto pertama, sekali per browser. */
const SHOWN = "tetra-promo-shown";
/** Event yang dikirim halaman tamu/galeri setelah tamu menyimpan foto. */
export const PROMO_SAVED = "tetra:saved";

type Saved = { id: string; code: string | null };
const read = (): Saved | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
const write = (v: Saved) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {}
};

const btn =
  "pressable flex h-11 items-center justify-center rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm font-bold no-underline";
const main =
  "pressable layered h-[52px] w-full rounded-[14px] border-[1.5px] border-ink bg-butter text-[15px] font-extrabold [--lb:1.5px] [--lx:4px] [--under:#fff] disabled:opacity-50";

/** Ubah screenshot ke JPEG ≤ 1600 px supaya muat batas unggah (±4 MB) dan cepat di data seluler. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = new OffscreenCanvas(Math.round(bmp.width * s), Math.round(bmp.height * s));
    c.getContext("2d")?.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    return await c.convertToBlob({ type: "image/jpeg", quality: 0.85 });
  } catch {
    return file;
  }
}

/**
 * Kartu promosi di halaman tamu & galeri (#215): follow/tag IG org + klien, ulasan Google, dan "Mau {org} di
 * acaramu?" → nomor WA (lead sales untuk Hermes) → klaim promo dengan screenshot bukti → kode unik.
 * Santai: kartu di bawah konten, pop-up hanya sekali setelah tamu menyimpan foto.
 */
export function GuestPromo({ promo }: { promo: Promo }) {
  const [open, setOpen] = useState(false);
  const tags = [...promo.clients, ...(promo.instagram ? [promo.instagram] : [])].map(
    (h) => `@${h}`,
  );
  useEffect(() => {
    const onSaved = () => {
      try {
        if (localStorage.getItem(SHOWN)) return;
        localStorage.setItem(SHOWN, "1");
      } catch {
        return;
      }
      setTimeout(() => setOpen(true), 1200);
    };
    window.addEventListener(PROMO_SAVED, onSaved);
    return () => window.removeEventListener(PROMO_SAVED, onSaved);
  }, []);

  return (
    <section
      data-testid="guest-promo"
      className="mx-5 mb-7 flex flex-col gap-3.5 rounded-[20px] border-[1.5px] border-ink bg-white p-4"
    >
      <h2 className="text-lg font-extrabold tracking-[-0.02em]">{t.title}</h2>
      {tags.length > 0 && <TagRow tags={tags} />}
      <div className="flex flex-wrap gap-2">
        {promo.instagram && (
          <a
            className={btn}
            href={`https://instagram.com/${promo.instagram}`}
            target="_blank"
            rel="noopener"
          >
            {t.instagram}
          </a>
        )}
        {promo.tiktok && (
          <a
            className={btn}
            href={`https://www.tiktok.com/@${promo.tiktok}`}
            target="_blank"
            rel="noopener"
          >
            {t.tiktok}
          </a>
        )}
        {promo.reviewUrl && (
          <a className={btn} href={promo.reviewUrl} target="_blank" rel="noopener">
            {t.review}
          </a>
        )}
        {promo.website && (
          <a className={btn} href={promo.website} target="_blank" rel="noopener">
            {t.website}
          </a>
        )}
      </div>
      {promo.whatsapp && (
        <button type="button" className={`${main} bg-mint-soft!`} onClick={() => setOpen(true)}>
          {promo.offer ? t.ctaOffer(promo.offer.reward) : t.cta(promo.org)}
        </button>
      )}
      {open && promo.whatsapp && <Sheet promo={promo} tags={tags} onClose={() => setOpen(false)} />}
    </section>
  );
}

function TagRow({ tags }: { tags: string[] }) {
  const [done, setDone] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-text-2">{t.tagLine}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((h) => (
          <span
            key={h}
            className="rounded-full border-[1.5px] border-ink bg-lavender px-3 py-1 font-mono text-[13px] font-bold"
          >
            {h}
          </span>
        ))}
        <button
          type="button"
          className="min-h-9 px-2 text-sm font-semibold underline"
          onClick={() =>
            navigator.clipboard?.writeText(tags.join(" ")).then(
              () => setDone(true),
              () => {},
            )
          }
        >
          {done ? t.copied : t.copyTags}
        </button>
      </div>
    </div>
  );
}

function Sheet({ promo, tags, onClose }: { promo: Promo; tags: string[]; onClose: () => void }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  useEffect(() => setSaved(read()), []);
  const step = !saved ? "wa" : saved.code ? "code" : promo.offer ? "claim" : "thanks";
  const keep = (v: Saved) => {
    write(v);
    setSaved(v);
  };
  return (
    <div className="fixed inset-0 z-30 mx-auto flex max-w-[480px] items-end bg-ink/20 p-3">
      <div
        role="dialog"
        aria-label={t.title}
        data-testid="promo-sheet"
        className="flex max-h-[92dvh] w-full flex-col gap-3.5 overflow-y-auto rounded-[28px] border-[1.5px] border-ink bg-white px-5 pt-2.5 pb-5"
      >
        <span className="h-1 w-9 self-center rounded-sm bg-ink" />
        {step === "wa" && <WaStep promo={promo} onDone={keep} />}
        {step === "claim" && saved && promo.offer && (
          <ClaimStep promo={promo} tags={tags} id={saved.id} onDone={keep} />
        )}
        {step === "code" && saved?.code && (
          <CodeStep code={saved.code} reward={promo.offer?.reward} />
        )}
        {step === "thanks" && (
          <>
            <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{t.thanks}</h2>
            <p className="text-sm text-text-2">{t.thanksSub(promo.org)}</p>
          </>
        )}
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 px-3 text-sm font-semibold text-text-2 underline"
        >
          {step === "wa" || step === "claim" ? t.later : t.close}
        </button>
      </div>
    </div>
  );
}

function WaStep({ promo, onDone }: { promo: Promo; onDone: (v: Saved) => void }) {
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const chat = `https://wa.me/${promo.whatsapp}?text=${encodeURIComponent(t.chatText(promo.eventName))}`;
  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!consent) return setError(t.invalid);
        setPending(true);
        const res = await fetch("/api/promo/lead", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            eventId: promo.eventId,
            whatsapp: String(new FormData(e.currentTarget).get("whatsapp") ?? ""),
            consent: true,
          }),
        }).catch(() => null);
        setPending(false);
        if (!res?.ok) return setError(res?.status === 400 ? t.invalid : t.failed);
        onDone(await res.json());
      }}
    >
      <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{t.waTitle(promo.org)}</h2>
      <p className="text-sm text-text-2">
        {t.waSub(promo.org)} {promo.offer && t.waOffer(promo.offer.reward)}
      </p>
      <label className="flex flex-col gap-1.5 text-xs font-bold">
        {t.waLabel}
        <input
          name="whatsapp"
          type="tel"
          required
          autoComplete="tel"
          placeholder={t.waPlaceholder}
          className="h-12 rounded-xl border-[1.5px] border-ink bg-white px-3.5 font-mono text-sm font-normal outline-none focus:bg-paper focus:shadow-[0_0_0_3px_var(--mint)]"
        />
      </label>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-dashed border-ink p-3">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="peer sr-only"
        />
        <span className="flex size-[22px] flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold text-white peer-checked:bg-green peer-focus-visible:shadow-[0_0_0_3px_var(--mint)]">
          {consent ? "✓" : ""}
        </span>
        <span className="text-xs leading-normal text-text-3">{t.consent(promo.org)}</span>
      </label>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-coral-strong">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={main}>
        {pending ? t.sending : t.waSend}
      </button>
      <a href={chat} target="_blank" className={btn} rel="noopener">
        {t.chatNow}
      </a>
    </form>
  );
}

function ClaimStep({
  promo,
  tags,
  id,
  onDone,
}: {
  promo: Promo;
  tags: string[];
  id: string;
  onDone: (v: Saved) => void;
}) {
  const offer = promo.offer;
  const [kind, setKind] = useState<Proof | null>(
    offer?.proofs.length === 1 ? offer.proofs[0]! : null,
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!offer) return null;
  return (
    <form
      className="flex flex-col gap-3.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!kind || !file) return setError(t.noFile);
        setPending(true);
        const body = new FormData();
        body.set("id", id);
        body.set("kind", kind);
        body.set("file", await shrink(file), "bukti.jpg");
        const res = await fetch("/api/promo/claim", { method: "POST", body }).catch(() => null);
        setPending(false);
        if (!res?.ok) return setError(t.failed);
        const { code } = (await res.json()) as { code: string };
        onDone({ id, code });
      }}
    >
      <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">
        {t.claimTitle(offer.reward)}
      </h2>
      <p className="text-sm text-text-2">{t.claimSub}</p>
      <fieldset className="flex flex-col gap-2">
        {offer.proofs.map((p) => (
          <label
            key={p}
            className={`pressable flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border-[1.5px] border-ink px-3.5 text-sm font-bold ${kind === p ? "bg-mint-soft" : "bg-white"}`}
          >
            <input
              type="radio"
              name="proof"
              checked={kind === p}
              onChange={() => setKind(p)}
              className="peer sr-only"
            />
            <span className="size-4 flex-none rounded-full border-[1.5px] border-ink peer-checked:bg-ink peer-focus-visible:shadow-[0_0_0_3px_var(--mint)]" />
            {p === "instagram"
              ? t.proof.instagram(tags.join(" ") || `@${promo.org}`)
              : t.proof.review}
          </label>
        ))}
      </fieldset>
      {kind === "review" && promo.reviewUrl && (
        <a href={promo.reviewUrl} target="_blank" className={btn} rel="noopener">
          {t.openReview}
        </a>
      )}
      <label className={`${btn} cursor-pointer gap-2`}>
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? `${t.changeFile} · ${file.name.slice(0, 24)}` : t.pickFile}
      </label>
      {error && (
        <p role="alert" className="text-[13px] font-semibold text-coral-strong">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className={main}>
        {pending ? t.sending : t.claim}
      </button>
    </form>
  );
}

function CodeStep({ code, reward }: { code: string; reward: string | undefined }) {
  const [done, setDone] = useState(false);
  return (
    <>
      <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{t.codeTitle}</h2>
      <p
        data-testid="promo-code"
        className="rounded-xl border-[1.5px] border-dashed border-ink bg-butter py-4 text-center font-mono text-2xl font-extrabold tracking-wider"
      >
        {code}
      </p>
      {reward && <p className="text-sm text-text-2">{t.codeSub(reward)}</p>}
      <button
        type="button"
        className={btn}
        onClick={() =>
          navigator.clipboard?.writeText(code).then(
            () => setDone(true),
            () => {},
          )
        }
      >
        {done ? t.copied : t.copyCode}
      </button>
    </>
  );
}
