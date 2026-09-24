"use client";
import { useTransition } from "react";
import { moderate } from "./actions";

export function SessionTile({
  eventId,
  id,
  thumb,
  time,
  hidden,
  status,
}: {
  eventId: string;
  id: string;
  thumb: string | null;
  time: string;
  hidden: boolean;
  status: string;
}) {
  const [pending, start] = useTransition();
  const act = (a: "hide" | "show" | "delete") => () => start(() => moderate(eventId, id, a));
  return (
    <div
      data-testid="session-tile"
      className={`flex flex-col overflow-hidden rounded-xl border-[1.5px] border-ink bg-white ${pending ? "opacity-50" : ""}`}
    >
      <a
        href={`/s/${id}`}
        target="_blank"
        rel="noreferrer"
        className="relative block aspect-[2/3] bg-neutral stripes"
      >
        {thumb && (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            className={`size-full object-contain ${hidden ? "opacity-30" : ""}`}
          />
        )}
        {hidden && (
          <span className="absolute inset-x-2 top-2 rounded-full border-[1.5px] border-ink bg-white px-2 py-0.5 text-center text-[11px] font-bold">
            Disembunyikan
          </span>
        )}
      </a>
      <div className="flex items-center justify-between px-2.5 py-2 font-mono text-[11px]">
        <span>{id}</span>
        <span className="text-text-2">{time}</span>
      </div>
      <div className="px-2.5 pb-2 text-[11px] font-semibold text-text-2">{status}</div>
      <div className="flex border-t-[1.5px] border-ink text-[11px] font-bold">
        <button
          type="button"
          disabled={pending}
          className="h-8 flex-1"
          onClick={act(hidden ? "show" : "hide")}
        >
          {hidden ? "Tampilkan" : "Sembunyikan"}
        </button>
        <button
          type="button"
          disabled={pending}
          className="h-8 flex-1 border-l-[1.5px] border-ink bg-coral"
          onClick={() => {
            if (confirm(`Hapus sesi ${id}? Foto dihapus permanen.`)) act("delete")();
          }}
        >
          Hapus
        </button>
      </div>
    </div>
  );
}
