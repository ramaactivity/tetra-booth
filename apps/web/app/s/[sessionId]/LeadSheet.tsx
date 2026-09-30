"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestLead } from "@/lib/guest";

const t = copy.lead;
const skipKey = (id: string) => `tetra-lead-skip:${id}`;

/**
 * Lead capture (desain v2 B4): bottom sheet. Gate = wajib, foto baru dikirim server setelah terisi (refresh);
 * optional = bisa "Lewati" (diingat di browser ini).
 */
export function LeadSheet({ sessionId, lead }: { sessionId: string; lead: GuestLead }) {
  const router = useRouter();
  const gate = lead.mode === "gate";
  const [open, setOpen] = useState(gate);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (gate) return;
    try {
      setOpen(localStorage.getItem(skipKey(sessionId)) !== "1");
    } catch {
      setOpen(true);
    }
  }, [gate, sessionId]);
  if (!open) return null;

  const skip = () => {
    try {
      localStorage.setItem(skipKey(sessionId), "1");
    } catch {}
    setOpen(false);
  };
  return (
    <div className="fixed inset-0 z-20 mx-auto flex max-w-[480px] items-end bg-ink/20 p-3">
      <form
        aria-label={t.title}
        className="flex w-full flex-col gap-3.5 rounded-[28px] border-[1.5px] border-ink bg-white px-5 pt-2.5 pb-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (!consent) return setError(t.invalid);
          setPending(true);
          const res = await fetch(`/api/s/${sessionId}/lead`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              data: Object.fromEntries(lead.fields.map((k) => [k, String(f.get(k) ?? "")])),
              consent: true,
            }),
          }).catch(() => null);
          setPending(false);
          if (!res?.ok) return setError(res?.status === 400 ? t.invalid : t.failed);
          setOpen(false);
          router.refresh();
        }}
      >
        <span className="h-1 w-9 self-center rounded-sm bg-ink" />
        <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">{t.title}</h2>
        {lead.fields.map((k) => {
          const m = t.fields[k];
          return (
            <label key={k} className="flex flex-col gap-1.5 text-xs font-bold">
              {m.label}
              <input
                name={k}
                type={m.type}
                required
                autoComplete={m.auto}
                placeholder={m.placeholder}
                className={`h-12 rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm font-normal outline-none focus:bg-paper focus:shadow-[0_0_0_3px_var(--mint)] ${k === "whatsapp" ? "font-mono" : ""}`}
              />
            </label>
          );
        })}
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
          <span className="text-xs leading-normal text-text-3">{lead.consentText}</span>
        </label>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-coral-strong">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="pressable layered h-[52px] rounded-[14px] border-[1.5px] border-ink bg-butter text-[15px] font-extrabold [--lb:1.5px] [--lx:4px] [--under:#fff] disabled:opacity-50"
        >
          {pending ? t.sending : t.submit}
        </button>
        {!gate && (
          <button
            type="button"
            onClick={skip}
            className="min-h-11 px-3 text-sm font-semibold text-text-2 underline"
          >
            {t.skip}
          </button>
        )}
      </form>
    </div>
  );
}
