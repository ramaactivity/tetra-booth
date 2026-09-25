"use client";
import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { input } from "../login/LoginForm";

const t = copy.admin;

// Dibuat saat dipakai (efek/submit), bukan saat render: halaman ini di-prerender tanpa env Supabase di CI.
const make = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    { auth: { detectSessionInUrl: false } },
  );
let client: ReturnType<typeof make> | null = null;
const sb = () => (client ??= make());

/**
 * Token dari link email ada di hash URL (alur implicit): dipasang jadi sesi cookie, lalu user membuat kata sandi.
 * Tanpa token tapi sudah masuk (mis. muat ulang) tetap bisa mengganti sandi.
 */
export function PasswordForm() {
  const router = useRouter();
  const [state, setState] = useState<"loading" | "ready" | "bad">("loading");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.slice(1));
    history.replaceState(null, "", window.location.pathname);
    const access_token = h.get("access_token");
    const refresh_token = h.get("refresh_token");
    (access_token && refresh_token
      ? sb()
          .auth.setSession({ access_token, refresh_token })
          .then((r) => !r.error)
      : sb()
          .auth.getUser()
          .then((r) => !!r.data.user)
    ).then((ok) => setState(ok ? "ready" : "bad"));
  }, []);

  if (state === "loading") return null;
  if (state === "bad")
    return (
      <div className="flex max-w-[420px] flex-col gap-[18px]">
        <h1 className="text-[40px] font-extrabold tracking-[-0.035em]">{t.passwordTitle}</h1>
        <p role="alert" className="text-sm font-semibold text-coral-strong">
          {t.passwordLinkBad}
        </p>
        <Link href="/admin/login?lupa" className="self-start text-[13px] font-bold underline">
          {t.forgot}
        </Link>
      </div>
    );

  return (
    <form
      className="flex max-w-[420px] flex-col gap-[18px]"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const password = String(f.get("password"));
        if (password.length < 8) return setError(t.passwordShort);
        if (password !== f.get("repeat")) return setError(t.passwordMismatch);
        setPending(true);
        const { error } = await sb().auth.updateUser({ password });
        setPending(false);
        if (error) return setError(t.passwordFailed);
        router.replace("/admin");
      }}
    >
      <h1 className="text-[40px] font-extrabold tracking-[-0.035em]">{t.passwordTitle}</h1>
      <label className="flex flex-col gap-1.5 text-xs font-bold">
        {t.passwordNew}
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={input}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs font-bold">
        {t.passwordRepeat}
        <input
          name="repeat"
          type="password"
          required
          autoComplete="new-password"
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
        {t.passwordSave}
      </button>
    </form>
  );
}
