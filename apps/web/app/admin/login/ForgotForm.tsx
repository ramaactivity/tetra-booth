"use client";
import Link from "next/link";
import { useActionState } from "react";
import { copy } from "@/lib/copy";
import { requestReset } from "./actions";
import { input } from "./LoginForm";

const t = copy.admin;

export function ForgotForm() {
  const [done, action, pending] = useActionState(requestReset, null);
  return (
    <form action={action} className="flex max-w-[420px] flex-col gap-[18px]">
      <h1 className="text-[40px] font-extrabold tracking-[-0.035em]">{t.forgotTitle}</h1>
      <p className="text-sm text-text-2">{t.forgotBody}</p>
      <label className="flex flex-col gap-1.5 text-xs font-bold">
        {t.email}
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      {done && (
        <p
          role="status"
          className="rounded-xl border-[1.5px] border-dashed border-ink bg-mint-soft p-3 text-sm"
        >
          {done}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="pressable layered mt-1.5 h-[52px] rounded-[14px] border-[1.5px] border-ink bg-butter text-[15px] font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
      >
        {t.forgotSend}
      </button>
      <Link href="/admin/login" className="self-start text-[13px] font-bold underline">
        {t.backToLogin}
      </Link>
    </form>
  );
}
