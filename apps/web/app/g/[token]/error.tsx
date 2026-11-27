"use client";
import { HelpLink } from "@/app/s/[sessionId]/HelpLink";
import { copy } from "@/lib/copy";

const t = copy.guest;

/** Gangguan server/database (audit 27 Nov): jujur "sedang gangguan", bukan "link dicabut"; error tercatat Sentry. */
export default function Trouble({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 bg-paper px-8 text-center">
      <span className="flex size-20 items-center justify-center rounded-[22px] border-[1.5px] border-dashed border-ink bg-peach text-[34px] font-extrabold">
        !
      </span>
      <h1 className="text-2xl leading-[1.2] font-extrabold tracking-[-0.025em]">
        {t.troubleTitle}
      </h1>
      <p className="text-sm leading-[1.55] text-pretty text-text-2">{t.troubleBody}</p>
      <button
        type="button"
        onClick={reset}
        className="pressable layered h-12 w-full rounded-xl border-[1.5px] border-ink bg-butter text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
      >
        {t.retry}
      </button>
      <HelpLink className="w-full" />
    </main>
  );
}
