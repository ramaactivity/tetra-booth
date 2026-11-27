"use client";
import { useState } from "react";
import { copy } from "@/lib/copy";

const t = copy.guest;

/** Tamu menyembunyikan fotonya dari galeri publik acara & layar TV (audit 27 Nov). */
export function PrivateToggle({ sessionId, on }: { sessionId: string; on: boolean }) {
  const [v, setV] = useState(on);
  const [busy, setBusy] = useState(false);
  return (
    <section className="mx-5 mb-7 flex items-center gap-3 rounded-[18px] border-[1.5px] border-dashed border-ink px-4 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold">{v ? t.privateOn : t.privateTitle}</span>
        <span className="mt-0.5 block text-xs leading-normal text-text-2">{t.privateBody}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={v}
        aria-label={t.privateTitle}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch(`/api/s/${sessionId}/private`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ on: !v }),
          }).catch(() => null);
          if (res?.ok) setV(!v);
          setBusy(false);
        }}
        className={`relative h-[28px] w-[50px] flex-none rounded-full border-[1.5px] border-ink transition-colors ${v ? "bg-mint" : "bg-white"}`}
      >
        <span
          aria-hidden
          className={`absolute top-[2.5px] size-[20px] rounded-full border-[1.5px] border-ink bg-white transition-[left] ${v ? "left-[24px]" : "left-[2.5px]"}`}
        />
      </button>
    </section>
  );
}
