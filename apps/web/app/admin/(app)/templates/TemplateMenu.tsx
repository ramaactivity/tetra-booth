"use client";
import { Popover, Select } from "@tetra/ui";
import { ArrowLeftRight, CalendarPlus, Copy, Ellipsis, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { archiveTemplate, assignTemplate, duplicateTemplate, setTemplateMode } from "./actions";
import type { AssignEvent, TemplateItem } from "./types";

const item =
  "flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-sm font-semibold hover:bg-paper disabled:opacity-50";
const dateText = (ymd: string) =>
  new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T00:00:00Z`));

/** Menu "Lainnya" per template: pasang ke event, duplikat, pindah mode, hapus (konfirmasi di menu) (#160). */
export function TemplateMenu({ t, events }: { t: TemplateItem; events: AssignEvent[] }) {
  const btn = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const other = t.mode === "photobox" ? "Event" : "Photobox";
  const close = () => {
    setOpen(false);
    setConfirm(false);
  };
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Lainnya untuk ${t.name}`}
        aria-expanded={open}
        title="Lainnya"
        onClick={() => (open ? close() : setOpen(true))}
        className="flex size-9 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-white hover:bg-paper"
      >
        <Ellipsis aria-hidden className="size-4" strokeWidth={2} />
      </button>
      <Popover
        anchor={btn}
        open={open}
        onClose={close}
        width={236}
        align="end"
        label={`Menu ${t.name}`}
      >
        <div className="flex flex-col p-1.5">
          <button
            type="button"
            className={item}
            onClick={() => {
              close();
              dialog.current?.showModal();
            }}
          >
            <CalendarPlus aria-hidden className="size-4" strokeWidth={2} />
            Pasang ke event…
          </button>
          <button
            type="button"
            className={item}
            aria-label={`Duplikat ${t.name}`}
            disabled={pending}
            onClick={() => start(() => duplicateTemplate(t.id))}
          >
            <Copy aria-hidden className="size-4" strokeWidth={2} />
            Duplikat
          </button>
          <button
            type="button"
            className={item}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setTemplateMode(t.id, t.mode === "photobox" ? "event" : "photobox");
                close();
              })
            }
          >
            <ArrowLeftRight aria-hidden className="size-4" strokeWidth={2} />
            Pindah ke {other}
          </button>
          <div className="my-1 border-t-[1.5px] border-dashed border-line-soft" />
          {confirm ? (
            <div className="flex flex-col gap-2 p-2">
              <p className="text-xs leading-normal text-text-2">
                Event yang sudah memakainya tetap mencetak dengan versi terakhirnya.
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(() => archiveTemplate(t.id))}
                  className="h-9 flex-1 rounded-[10px] border-[1.5px] border-ink bg-coral-strong text-[13px] font-bold"
                >
                  Ya, hapus
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  className="h-9 flex-1 rounded-[10px] border-[1.5px] border-ink bg-white text-[13px] font-bold"
                >
                  Batal
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`${item} hover:bg-coral`}
              aria-label={`Hapus ${t.name}`}
              onClick={() => setConfirm(true)}
            >
              <Trash2 aria-hidden className="size-4" strokeWidth={2} />
              Hapus
            </button>
          )}
        </div>
      </Popover>
      <AssignDialog ref={dialog} t={t} events={events.filter((e) => e.mode === t.mode)} />
    </>
  );
}

/** Pasang template ke satu event lewat jalur simpan Pengaturan (bundle baru). */
function AssignDialog({
  ref,
  t,
  events,
}: {
  ref: React.RefObject<HTMLDialogElement | null>;
  t: TemplateItem;
  events: AssignEvent[];
}) {
  const [r, action, pending] = useActionState(assignTemplate.bind(null, t.id), null);
  const [ev, setEv] = useState("");
  const photobox = t.mode === "photobox";
  return (
    <dialog
      ref={ref}
      aria-label={`Pasang ${t.name} ke event`}
      className="m-auto w-[460px] max-w-[calc(100vw-32px)] rounded-[22px] border-[1.5px] border-ink bg-white p-6 backdrop:bg-ink/40"
    >
      <form action={action} className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-[-0.02em]">Pasang ke event</h2>
            <p className="mt-1 text-sm text-text-2">
              {photobox
                ? `"${t.name}" ditambahkan ke desain yang dijual di photobox itu.`
                : `"${t.name}" jadi desain utama event itu. Desain lain berkertas sama tetap jadi pilihan tamu.`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Tutup"
            onClick={() => ref.current?.close()}
            className="flex size-9 flex-none items-center justify-center rounded-full border-[1.5px] border-ink hover:bg-paper"
          >
            <X aria-hidden className="size-4" strokeWidth={2} />
          </button>
        </div>
        {events.length ? (
          <>
            <div className="flex flex-col gap-1.5 text-xs font-bold">
              {photobox ? "Photobox" : "Event mendatang"}
              <Select
                name="event"
                label="Event"
                searchable
                value={ev}
                onChange={setEv}
                placeholder="Pilih event…"
                options={events.map((e) => ({
                  value: e.id,
                  label: e.name,
                  hint: dateText(e.date),
                }))}
              />
            </div>
            {photobox && (
              <label className="flex flex-col gap-1.5 text-xs font-bold">
                Harga paket (Rp)
                <input
                  name="price"
                  type="number"
                  min={1500}
                  step={500}
                  defaultValue={25000}
                  className="h-10 rounded-[11px] border-[1.5px] border-ink px-3 font-mono text-sm font-normal outline-none focus:shadow-[0_0_0_3px_var(--mint)]"
                />
              </label>
            )}
            {r && (
              <p
                role="status"
                className={`rounded-xl border-[1.5px] border-ink px-3.5 py-2.5 text-sm font-semibold ${r.ok ? "bg-mint-soft" : "bg-coral"}`}
              >
                {r.message}{" "}
                {r.ok && r.slug && (
                  <Link href={`/admin/events/${r.slug}/settings`} className="font-bold">
                    Buka pengaturan event
                  </Link>
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={pending || !ev}
              className="pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter text-sm font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
            >
              {pending ? "Memasang…" : "Pasang"}
            </button>
          </>
        ) : (
          <p className="rounded-xl border-[1.5px] border-dashed border-ink px-3.5 py-3 text-sm text-text-2">
            {photobox
              ? "Belum ada photobox yang berjalan."
              : "Belum ada event mendatang. Buat event dulu dari menu Event."}
          </p>
        )}
      </form>
    </dialog>
  );
}
