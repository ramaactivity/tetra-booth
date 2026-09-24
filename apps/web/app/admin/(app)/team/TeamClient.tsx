"use client";
import { useActionState, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { invite, updateMember } from "./actions";

const t = copy.admin.team;
const button =
  "pressable layered rounded-xl border-[1.5px] border-ink bg-butter text-sm font-extrabold [--lb:1.5px] [--lx:4px]";

function Result({ r }: { r: Awaited<ReturnType<typeof invite>> }) {
  const [copied, setCopied] = useState(false);
  if (!r) return null;
  if ("error" in r)
    return (
      <p role="alert" className="text-sm font-semibold text-coral-strong">
        {r.error}
      </p>
    );
  if ("sent" in r) return <p className="text-sm font-semibold">{t.sent(r.sent)}</p>;
  if ("added" in r) return <p className="text-sm font-semibold">{t.added(r.added)}</p>;
  return (
    <div className="flex flex-col gap-2 rounded-xl border-[1.5px] border-dashed border-ink bg-sky p-3 text-sm">
      <p>{t.linkNote(r.email)}</p>
      <input
        readOnly
        value={r.link}
        aria-label="Link undangan"
        className="h-10 rounded-lg border-[1.5px] border-ink bg-white px-2.5 font-mono text-xs"
      />
      <button
        type="button"
        className={`${button} h-10`}
        onClick={() => navigator.clipboard.writeText(r.link).then(() => setCopied(true))}
      >
        {copied ? t.copied : t.copy}
      </button>
    </div>
  );
}

/** Tombol + modal Undang Anggota (E7): email + role sebagai kartu pilihan. */
export function InviteButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [r, action, pending] = useActionState(invite, null);
  return (
    <>
      <button
        type="button"
        className={`${button} h-11 px-[18px]`}
        onClick={() => ref.current?.showModal()}
      >
        {t.invite}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[440px] max-w-[calc(100vw-32px)] rounded-[22px] border-[1.5px] border-ink bg-white p-6 backdrop:bg-ink/40"
      >
        <form action={action} className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-[-0.02em]">{t.inviteTitle}</h2>
            <button
              type="button"
              aria-label={t.close}
              onClick={() => ref.current?.close()}
              className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-ink"
            >
              ×
            </button>
          </div>
          <label className="flex flex-col gap-1.5 text-xs font-bold">
            {copy.admin.email}
            <input
              name="email"
              type="email"
              required
              className="h-12 rounded-xl border-[1.5px] border-ink px-3.5 text-sm font-normal outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
            />
          </label>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-xs font-bold">Role</legend>
            <div className="grid grid-cols-2 gap-2.5">
              {t.roleCards.map((c, i) => (
                <label
                  key={c.v}
                  className="flex cursor-pointer items-center justify-between rounded-xl border-[1.5px] border-ink p-3 has-[:checked]:bg-sky"
                >
                  <span>
                    <span className="block text-sm font-bold">{c.t}</span>
                    <span className="block text-[11px] text-text-2">{c.d}</span>
                  </span>
                  <input
                    type="radio"
                    name="role"
                    value={c.v}
                    defaultChecked={i === 1}
                    className="size-5 accent-[var(--green)]"
                  />
                </label>
              ))}
            </div>
          </fieldset>
          <Result r={r} />
          <button
            type="submit"
            disabled={pending}
            className={`${button} h-[52px] disabled:opacity-50`}
          >
            {pending ? t.sending : t.send}
          </button>
        </form>
      </dialog>
    </>
  );
}

/** Menu "…" per anggota: ubah role, nonaktifkan / aktifkan lagi. */
export function MemberMenu({
  id,
  email,
  role,
  active,
}: {
  id: string;
  email: string;
  role: string;
  active: boolean;
}) {
  const item = "block w-full px-3.5 py-2 text-left text-[13px] font-semibold hover:bg-paper";
  const ref = useRef<HTMLDetailsElement>(null);
  const act = (patch: { role?: "owner" | "admin" | "crew"; active?: boolean }) => {
    ref.current?.removeAttribute("open");
    return updateMember(id, patch);
  };
  return (
    <details ref={ref} className="relative inline-block">
      <summary
        aria-label={`Aksi ${email}`}
        className="cursor-pointer list-none px-2 text-lg leading-none"
      >
        ⋯
      </summary>
      <div className="absolute right-0 z-10 mt-1 w-48 overflow-hidden rounded-xl border-[1.5px] border-ink bg-white py-1 text-left">
        {(["owner", "admin", "crew"] as const)
          .filter((x) => x !== role)
          .map((x) => (
            <button key={x} type="button" className={item} onClick={() => act({ role: x })}>
              {t.makeRole(copy.admin.roles[x] ?? x)}
            </button>
          ))}
        {active ? (
          <button
            type="button"
            className={`${item} text-coral-strong`}
            onClick={() => confirm(t.confirmDeactivate(email)) && act({ active: false })}
          >
            {t.deactivate}
          </button>
        ) : (
          <button type="button" className={item} onClick={() => act({ active: true })}>
            {t.activate}
          </button>
        )}
      </div>
    </details>
  );
}
