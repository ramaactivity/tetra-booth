"use client";
import { Popover, Select } from "@tetra/ui";
import { Ellipsis, Mail, Plus, Power, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { copy } from "@/lib/copy";
import type { Role } from "@/lib/supabase/server";
import { type InviteResult, invite, removeMember, resendInvite, updateMember } from "./actions";
import { ROLE_BG, ROLES, roleAccess } from "./roles";

const t = copy.admin.team;
const roleName = (r: string) => copy.admin.roles[r] ?? r;
const button =
  "pressable layered inline-flex items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink bg-butter text-sm font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50";
const dialogCls =
  "m-auto w-[480px] max-w-[calc(100vw-32px)] rounded-[22px] border-[1.5px] border-ink bg-white p-6 backdrop:bg-ink/40";

function DialogHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <h2 className="text-xl font-extrabold tracking-[-0.02em] [overflow-wrap:anywhere]">
        {title}
      </h2>
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="flex size-9 flex-none items-center justify-center rounded-full border-[1.5px] border-ink hover:bg-paper"
      >
        <X aria-hidden className="size-4" strokeWidth={2} />
      </button>
    </div>
  );
}

function Result({ r }: { r: InviteResult }) {
  const [copied, setCopied] = useState(false);
  if (!r) return null;
  if ("error" in r)
    return (
      <p
        role="alert"
        className="rounded-xl border-[1.5px] border-ink bg-coral px-3.5 py-2.5 text-sm font-semibold"
      >
        {r.error}
      </p>
    );
  if ("sent" in r || "added" in r)
    return (
      <p
        role="status"
        className="rounded-xl border-[1.5px] border-ink bg-mint-soft px-3.5 py-2.5 text-sm font-semibold"
      >
        {"sent" in r ? t.sent(r.sent) : t.added(r.added)}
      </p>
    );
  return (
    <div className="flex flex-col gap-2 rounded-xl border-[1.5px] border-dashed border-ink bg-sky p-3 text-sm">
      <p>{t.linkNote(r.email)}</p>
      <input
        readOnly
        value={r.link}
        aria-label="Link undangan"
        onFocus={(e) => e.currentTarget.select()}
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

/** Tombol + modal Undang Anggota (E7): email + role sebagai kartu pilihan dengan penjelasan aksesnya. */
export function InviteButton() {
  const ref = useRef<HTMLDialogElement>(null);
  const [r, action, pending] = useActionState(invite, null);
  const uid = useId();
  return (
    <>
      <button
        type="button"
        className={`${button} h-11 flex-none whitespace-nowrap px-[18px]`}
        onClick={() => ref.current?.showModal()}
      >
        <Plus aria-hidden className="size-4" strokeWidth={2} />
        {t.invite}
      </button>
      <dialog ref={ref} aria-label={t.inviteTitle} className={dialogCls}>
        <form action={action} className="flex flex-col gap-4">
          <div>
            <DialogHead title={t.inviteTitle} onClose={() => ref.current?.close()} />
            <p className="mt-1 text-sm text-text-2">{t.inviteHint}</p>
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
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-xs font-bold">Role</legend>
            {(["admin", "crew"] as const).map((v) => (
              <label
                key={v}
                className="flex cursor-pointer items-start gap-3 rounded-xl border-[1.5px] border-ink p-3.5 has-[:checked]:bg-mint-soft"
              >
                <input
                  type="radio"
                  name="role"
                  value={v}
                  defaultChecked={v === "crew"}
                  aria-describedby={`${uid}-${v}`}
                  className="mt-0.5 size-5 flex-none accent-[var(--green)]"
                />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-extrabold">{roleName(v)}</span>
                  <span id={`${uid}-${v}`} className="flex flex-col gap-1 text-[13px] text-text-2">
                    <span>{t.roleInfo[v]}</span>
                    {roleAccess(v).map(([k, list]) => (
                      <span key={k}>
                        <span className="font-semibold text-ink">{k}:</span> {list}
                      </span>
                    ))}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Result r={r} />
          <button type="submit" disabled={pending} className={`${button} h-[52px]`}>
            {pending ? t.sending : t.send}
          </button>
        </form>
      </dialog>
    </>
  );
}

type Ask = {
  title: string;
  body: string;
  ok: string;
  danger?: boolean;
  run: () => Promise<unknown>;
};

/** Role (dropdown) + menu "…" per anggota: kirim ulang undangan, nonaktifkan, hapus. Konfirmasi di dialog. */
export function MemberControls({
  id,
  name,
  email,
  role,
  active,
  pending,
  self,
}: {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  pending: boolean;
  self: boolean;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [menu, setMenu] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [res, setRes] = useState<InviteResult>(null);
  const [busy, start] = useTransition();
  const open = !!ask || !!res;
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const close = () => {
    setAsk(null);
    setRes(null);
  };

  if (self)
    return (
      <>
        <span
          className={`justify-self-start rounded-md border-[1.5px] border-ink px-2.5 py-1 text-xs font-bold ${ROLE_BG[role]}`}
        >
          {roleName(role)}
        </span>
        <span className="hidden @2xl:block" />
      </>
    );

  const changeRole = (v: string) => {
    if (v === role) return;
    const run = () => updateMember(id, { role: v as Role });
    // Turun role atau jadi Owner (akses Tim) → konfirmasi; naik Crew → Admin langsung.
    if (v === "owner" || ROLES.indexOf(v as Role) > ROLES.indexOf(role as Role))
      setAsk({
        title: t.confirmRole(name, roleName(v)),
        body: `${t.confirmRoleBody(roleName(v))} ${roleAccess(v)
          .map(([k, l]) => `${k.toLowerCase()} ${l}`)
          .join("; ")}.`,
        ok: `Jadikan ${roleName(v)}`,
        run,
      });
    else start(run);
  };
  const item =
    "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-semibold hover:bg-paper disabled:opacity-50";
  const pick = (a: Ask) => {
    setMenu(false);
    setAsk(a);
  };

  return (
    <>
      <div className="w-[136px]">
        <Select
          size="sm"
          label={t.roleLabel(email)}
          value={role}
          onChange={changeRole}
          options={ROLES.map((r) => ({ value: r, label: roleName(r) }))}
        />
      </div>
      <button
        ref={btn}
        type="button"
        aria-label={t.actions(email)}
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
        className="flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-white hover:bg-paper"
      >
        <Ellipsis aria-hidden className="size-4" strokeWidth={2} />
      </button>
      <Popover
        anchor={btn}
        open={menu}
        onClose={() => setMenu(false)}
        width={230}
        align="end"
        label={`Menu ${email}`}
      >
        <div className="flex flex-col p-1.5">
          {pending && (
            <button
              type="button"
              className={item}
              disabled={busy}
              onClick={() =>
                start(async () => {
                  setMenu(false);
                  setRes(await resendInvite(id));
                })
              }
            >
              <Mail aria-hidden className="size-4" strokeWidth={2} />
              {t.resend}
            </button>
          )}
          {active ? (
            <button
              type="button"
              className={item}
              onClick={() =>
                pick({
                  title: t.confirmDeactivate(name),
                  body: t.confirmDeactivateBody,
                  ok: t.deactivate,
                  run: () => updateMember(id, { active: false }),
                })
              }
            >
              <Power aria-hidden className="size-4" strokeWidth={2} />
              {t.deactivate}
            </button>
          ) : (
            <button
              type="button"
              className={item}
              disabled={busy}
              onClick={() => {
                setMenu(false);
                start(() => updateMember(id, { active: true }));
              }}
            >
              <Power aria-hidden className="size-4" strokeWidth={2} />
              {t.activate}
            </button>
          )}
          <div className="my-1 border-t-[1.5px] border-dashed border-line-soft" />
          <button
            type="button"
            className={`${item} hover:bg-coral`}
            onClick={() =>
              pick({
                title: t.confirmRemove(name),
                body: t.confirmRemoveBody,
                ok: t.remove,
                danger: true,
                run: () => removeMember(id),
              })
            }
          >
            <Trash2 aria-hidden className="size-4" strokeWidth={2} />
            {t.remove}
          </button>
        </div>
      </Popover>
      <dialog
        ref={dialog}
        aria-label={ask?.title ?? t.resendTitle}
        onClose={close}
        className={dialogCls}
      >
        <div className="flex flex-col gap-4">
          <DialogHead title={ask?.title ?? t.resendTitle} onClose={close} />
          {ask ? (
            <>
              <p className="text-sm text-text-2">{ask.body}</p>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  className="h-11 rounded-xl border-[1.5px] border-ink bg-white px-5 text-sm font-bold hover:bg-paper"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    start(async () => {
                      await ask.run();
                      close();
                    })
                  }
                  className={`${ask.danger ? button.replace("bg-butter", "bg-coral-strong") : button} h-11 px-5`}
                >
                  {ask.ok}
                </button>
              </div>
            </>
          ) : (
            <Result r={res} />
          )}
        </div>
      </dialog>
    </>
  );
}
