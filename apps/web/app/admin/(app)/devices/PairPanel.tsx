"use client";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import { addDevice, newPairingCode, type PairResult, pairStatus, revokeDevice } from "./actions";

const t = copy.admin.devices;
/** Cek tiap 3 dtk apakah laptop booth sudah memakai kode (langkah 4). */
const POLL_MS = 3000;
const btn =
  "pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink px-[18px] text-sm font-extrabold disabled:opacity-50";
const primary = `${btn} layered bg-butter [--lb:1.5px] [--lx:4px]`;
const secondary = `${btn} bg-white`;

/** `<dialog>` bawaan: fokus terkunci, Esc menutup. Isi dipasang hanya saat terbuka, jadi tiap buka mulai bersih. */
function Modal({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={onClose}
      className="m-auto max-h-[calc(100dvh-32px)] w-[600px] max-w-[calc(100vw-32px)] rounded-[22px] border-[1.5px] border-ink bg-white p-0 text-ink backdrop:bg-ink/40"
    >
      {open && children}
    </dialog>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b-[1.5px] border-ink px-6 py-4">
      <h2 className="text-xl font-extrabold tracking-[-0.02em]">{title}</h2>
      <button
        type="button"
        aria-label={t.close}
        onClick={onClose}
        className="flex size-11 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-xl"
      >
        ×
      </button>
    </div>
  );
}

type StepState = "done" | "active" | "todo";
function Step({
  n,
  title,
  state,
  testId,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  testId: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3.5" data-testid={testId} data-state={state}>
      <span
        className={`flex size-8 flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-sm font-extrabold ${
          state === "done"
            ? "bg-green text-white"
            : state === "active"
              ? "bg-butter"
              : "border-dashed bg-white text-text-2"
        }`}
      >
        {state === "done" ? <Check size={16} strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className={`text-[15px] font-extrabold ${state === "todo" ? "text-text-2" : ""}`}>
          {title}
        </h3>
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    </li>
  );
}

const mmss = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Alur menyambungkan laptop booth (4 langkah): nama → kode 6 angka (hitung mundur, salin, buat baru)
 * → petunjuk tombol di booth → deteksi otomatis tersambung. Dipakai untuk booth baru dan sambung ulang.
 */
function PairGuide({
  device,
  reconnect = false,
  onClose,
}: {
  /** Kosong = booth baru (mulai dari langkah nama). */
  device?: { id: string; name: string };
  reconnect?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [cur, setCur] = useState<{
    id: string;
    name: string;
    code: string;
    expiresAt: number;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const run = async (p: Promise<PairResult>) => {
    setBusy(true);
    const r = await p.catch(() => ({ error: "Gagal membuat kode, coba lagi" }));
    setBusy(false);
    if (r && "code" in r) {
      setCur({ id: r.id, name: r.name, code: r.code, expiresAt: Date.now() + r.ttlMs });
      setNow(Date.now());
      setCopied(false);
      setErr(null);
    } else setErr(r?.error ?? null);
  };

  // Booth yang sudah terdaftar: langsung buat kode (sekali, aman di StrictMode).
  const started = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: hanya saat panel dibuka
  useEffect(() => {
    if (!device || started.current) return;
    started.current = true;
    void run(newPairingCode(device.id));
  }, []);

  const left = cur ? Math.max(0, cur.expiresAt - now) : 0;
  const live = !!cur && left > 0 && !connected;
  useEffect(() => {
    if (!live || !cur) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      pairStatus(cur.id).then(
        (ok) => {
          if (!ok) return;
          setConnected(true);
          router.refresh();
        },
        () => {},
      );
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [live, cur, router]);

  const name = cur?.name ?? device?.name ?? "";
  const s1: StepState = cur || device ? "done" : "active";
  const s2: StepState = connected ? "done" : cur ? "active" : "todo";
  const s4: StepState = connected ? "done" : live ? "active" : "todo";

  return (
    <>
      <Header
        title={
          device
            ? reconnect
              ? t.repairTitle(device.name)
              : `${t.connect} ${device.name}`
            : t.addTitle
        }
        onClose={onClose}
      />
      <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
        {reconnect && !connected && (
          <p className="rounded-[14px] border-[1.5px] border-dashed border-ink bg-sky px-4 py-3 text-[13px] leading-normal font-semibold text-text-3">
            {t.repairWhy}
          </p>
        )}
        <ol className="flex flex-col gap-5">
          <Step n={1} title={device ? t.step1Existing : t.step1} state={s1} testId="pair-step-name">
            {s1 === "done" ? (
              <p className="text-sm font-semibold text-text-2">{name}</p>
            ) : (
              <form action={(fd) => run(addDevice(null, fd))} className="flex flex-col gap-2">
                <label htmlFor="booth-name" className="text-[13px] text-text-2">
                  {t.step1Hint}
                </label>
                <div className="flex flex-wrap gap-2.5">
                  <input
                    id="booth-name"
                    name="name"
                    placeholder={t.namePlaceholder}
                    required
                    maxLength={60}
                    // biome-ignore lint/a11y/noAutofocus: langkah pertama dialog
                    autoFocus
                    className="h-11 min-w-0 flex-1 rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
                  />
                  <button type="submit" disabled={busy} className={primary}>
                    {busy ? t.making : t.makeCode}
                  </button>
                </div>
              </form>
            )}
          </Step>

          <Step n={2} title={t.step2} state={s2} testId="pair-step-code">
            {cur && !connected && (
              <div
                data-testid="pair-code"
                className={`flex flex-wrap items-center justify-between gap-4 rounded-[16px] border-[1.5px] border-ink px-4 py-3.5 ${live ? "bg-sky" : "bg-peach"}`}
              >
                <output
                  data-testid="pair-code-value"
                  aria-label={cur.code}
                  className={`flex gap-4 font-mono text-[34px] leading-none font-medium ${live ? "" : "line-through opacity-50"}`}
                >
                  {[cur.code.slice(0, 3), cur.code.slice(3)].map((g, gi) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: dua kelompok tetap (3-3)
                    <span key={gi} className="flex gap-1.5">
                      {[...g].map((c, i) => (
                        <span
                          // biome-ignore lint/suspicious/noArrayIndexKey: posisi digit tetap
                          key={i}
                          className="flex h-[58px] w-11 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-white"
                        >
                          {c}
                        </span>
                      ))}
                    </span>
                  ))}
                </output>
                {live ? (
                  <div className="flex flex-col items-end gap-2">
                    <span
                      className="font-mono text-sm font-bold"
                      data-testid="pair-countdown"
                      aria-live="off"
                    >
                      {t.validFor(mmss(left))}
                    </span>
                    <button
                      type="button"
                      className={secondary}
                      onClick={() =>
                        navigator.clipboard.writeText(cur.code).then(
                          () => setCopied(true),
                          () => {},
                        )
                      }
                    >
                      {copied ? <Check size={16} strokeWidth={2.5} /> : <Copy size={16} />}
                      {copied ? t.copied : t.copyCode}
                    </button>
                  </div>
                ) : (
                  <div className="flex w-full flex-col gap-2.5">
                    <p className="text-[13px] font-bold" role="alert">
                      {t.expired}
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      className={`${primary} self-start`}
                      onClick={() => run(newPairingCode(cur.id))}
                    >
                      {busy ? t.making : t.newCode}
                    </button>
                  </div>
                )}
              </div>
            )}
            {err && (
              <p className="text-sm font-semibold text-coral-strong" role="alert">
                {err}
              </p>
            )}
          </Step>

          <Step
            n={3}
            title={t.step3}
            state={connected ? "done" : live ? "active" : "todo"}
            testId="pair-step-booth"
          >
            {live && (
              <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-normal font-medium text-text-3 marker:font-bold">
                {t.boothSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            )}
          </Step>

          <Step
            n={4}
            title={connected ? t.connected(name) : t.step4}
            state={s4}
            testId="pair-step-done"
          >
            {live && (
              <p
                className="flex items-center gap-2.5 text-[13px] font-semibold text-text-2"
                role="status"
              >
                <span className="size-2.5 flex-none animate-pulse rounded-full bg-mint" />
                {t.waiting}
              </p>
            )}
            {connected && (
              <div
                className="flex flex-col gap-3 rounded-[16px] border-[1.5px] border-ink bg-mint-soft px-4 py-3.5"
                role="status"
              >
                <h4 className="text-sm font-extrabold">{t.nextTitle}</h4>
                <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[13px] leading-normal font-medium text-text-3 marker:font-bold">
                  {t.next.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ol>
                <div className="flex flex-wrap gap-2.5">
                  <Link href="/admin/events" className={primary}>
                    {t.toEvents}
                  </Link>
                  <button type="button" className={secondary} onClick={onClose}>
                    {t.done}
                  </button>
                </div>
              </div>
            )}
          </Step>
        </ol>
      </div>
    </>
  );
}

export function AddDevice() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary}>
        {t.add}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} label={t.addTitle}>
        <PairGuide onClose={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function DeviceActions({ id, name, paired }: { id: string; name: string; paired: boolean }) {
  const [open, setOpen] = useState<"pair" | "revoke" | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setOpen(null);
  return (
    <>
      <div className="mt-auto flex border-t-[1.5px] border-ink">
        <button
          type="button"
          className="h-11 flex-1 text-[13px] font-bold"
          onClick={() => setOpen("pair")}
        >
          {paired ? t.reconnect : t.connect}
        </button>
        <button
          type="button"
          className="h-11 flex-1 border-l-[1.5px] border-ink bg-coral text-[13px] font-bold"
          onClick={() => setOpen("revoke")}
        >
          {t.deactivate}
        </button>
      </div>
      <Modal
        open={open === "pair"}
        onClose={close}
        label={paired ? t.repairTitle(name) : t.connect}
      >
        <PairGuide device={{ id, name }} reconnect={paired} onClose={close} />
      </Modal>
      <Modal open={open === "revoke"} onClose={close} label={t.deactivateTitle(name)}>
        <Header title={t.deactivateTitle(name)} onClose={close} />
        <div className="flex flex-col gap-5 px-6 py-5">
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-normal font-medium text-text-3">
            {t.deactivateBody.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2.5">
            <button type="button" className={secondary} onClick={close}>
              {t.cancel}
            </button>
            <button
              type="button"
              disabled={busy}
              className={`${btn} bg-coral-strong`}
              onClick={async () => {
                setBusy(true);
                await revokeDevice(id);
                setBusy(false);
                close();
              }}
            >
              {t.deactivateYes}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Pantauan jarak jauh: muat ulang data server berkala selama tab terlihat (tanpa state klien yang hilang). */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
