"use client";
import Link from "next/link";
import { useActionState } from "react";
import { copy } from "@/lib/copy";
import { signIn } from "./actions";

const t = copy.admin;
export const input =
  "h-12 rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm outline-none focus:shadow-[0_0_0_3px_var(--mint)]";

export function LoginForm({ note }: { note: string | null }) {
  const [error, action, pending] = useActionState(signIn, note);
  return (
    <form action={action} className="flex max-w-[420px] flex-col gap-[18px]">
      <h1 className="text-[40px] font-extrabold tracking-[-0.035em]">{t.loginTitle}</h1>
      <label className="flex flex-col gap-1.5 text-xs font-bold">
        {t.email}
        <input name="email" type="email" required autoComplete="email" className={input} />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-bold">
        {t.password}
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={input}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm font-semibold text-coral-strong">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="pressable layered mt-1.5 h-[52px] rounded-[14px] border-[1.5px] border-ink bg-butter text-[15px] font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
      >
        {pending ? t.signingIn : t.signIn}
      </button>
      <Link href="/admin/login?lupa" className="self-start text-[13px] font-bold underline">
        {t.forgot}
      </Link>
    </form>
  );
}
