"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { revealGuest, reviewGuest } from "./actions";

export type PendingItem = {
  id: string;
  name: string;
  /** Nomor WA tamu (#232), untuk menelusuri foto yang bermasalah. */
  wa: string | null;
  time: string;
  strip: boolean;
  thumb: string;
};

/** "Buka foto sekarang" dengan konfirmasi (E15). */
export function RevealButton({ eventId }: { eventId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          if (confirm("Buka semua foto tamu sekarang? Tamu dan galeri langsung bisa melihatnya."))
            await revealGuest(eventId);
        })
      }
      className="layered pressable h-11 rounded-[12px] border-[1.5px] border-ink bg-butter px-4 text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
    >
      Buka foto sekarang
    </button>
  );
}

/**
 * ModerationGrid (E15): grid 6 kolom foto tamu yang menunggu. Fokus = cincin mint; A setujui, X tolak, ←→ pindah,
 * Shift+klik pilih banyak; bar tinta muncul saat ada pilihan. Kartu redup saat diproses.
 */
export function ModerationGrid({
  eventId,
  items,
  canEdit,
}: {
  eventId: string;
  items: PendingItem[];
  canEdit: boolean;
}) {
  const [focus, setFocus] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [, start] = useTransition();
  const shown = useMemo(() => items.filter((i) => !busy.has(i.id)), [items, busy]);

  const act = (ids: string[], decision: "approve" | "reject") => {
    if (!canEdit || !ids.length) return;
    setBusy((b) => new Set([...b, ...ids]));
    setSel(new Set());
    start(() => reviewGuest(eventId, ids, decision));
  };

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const cur = shown[focus];
      if (e.key === "ArrowRight") setFocus((f) => Math.min(shown.length - 1, f + 1));
      else if (e.key === "ArrowLeft") setFocus((f) => Math.max(0, f - 1));
      else if ((e.key === "a" || e.key === "A") && cur)
        act(sel.size ? [...sel] : [cur.id], "approve");
      else if ((e.key === "x" || e.key === "X") && cur)
        act(sel.size ? [...sel] : [cur.id], "reject");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  });

  const key = (k: string, bg: string) => (
    <span
      className={`flex size-6 items-center justify-center rounded-md border-[1.5px] border-ink font-mono text-[11px] ${bg}`}
    >
      {k}
    </span>
  );
  return (
    <div className="rounded-2xl border-[1.5px] border-ink bg-white">
      <div className="flex flex-wrap items-center gap-3 border-b-[1.5px] border-dashed border-ink px-5 py-3.5">
        <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">Perlu disetujui</h3>
        <span className="flex h-6 items-center rounded-full border-[1.5px] border-ink bg-peach px-2 font-mono text-xs">
          {shown.length}
        </span>
        <span className="flex-1" />
        {canEdit && shown.length > 0 && (
          <span className="flex items-center gap-3 text-xs text-text-2">
            <span className="flex items-center gap-1.5">{key("A", "bg-mint-soft")} setujui</span>
            <span className="flex items-center gap-1.5">{key("X", "bg-coral")} tolak</span>
            <span className="flex items-center gap-1.5">{key("←→", "bg-white")} pindah</span>
            <button
              type="button"
              onClick={() => setSel(new Set(shown.map((i) => i.id)))}
              className="font-bold text-ink underline"
            >
              Pilih semua
            </button>
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="flex items-center justify-center gap-2 px-5 py-10 text-sm font-bold">
          <span className="flex size-6 items-center justify-center rounded-full border-[1.5px] border-ink bg-green text-xs text-white">
            ✓
          </span>
          Antrean kosong
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-3 lg:grid-cols-6">
          {shown.map((it, i) => {
            const picked = sel.has(it.id);
            return (
              <li key={it.id} className="flex flex-col gap-1.5">
                <div
                  className={`group relative overflow-hidden rounded-xl border-[1.5px] border-ink bg-neutral ${it.strip ? "aspect-[1/2]" : "aspect-[3/4]"} ${focus === i ? "shadow-[0_0_0_3px_var(--mint)]" : ""}`}
                >
                  <button
                    type="button"
                    aria-label={`Foto ${it.name} ${it.time}`}
                    onClick={(e) => {
                      setFocus(i);
                      if (e.shiftKey)
                        setSel((s) => {
                          const n = new Set(s);
                          if (n.has(it.id)) n.delete(it.id);
                          else n.add(it.id);
                          return n;
                        });
                    }}
                    className="absolute inset-0"
                  >
                    {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
                    <img src={it.thumb} alt="" loading="lazy" className="size-full object-cover" />
                  </button>
                  {canEdit && (
                    <>
                      <input
                        type="checkbox"
                        aria-label={`Pilih foto ${it.name}`}
                        checked={picked}
                        onChange={() =>
                          setSel((s) => {
                            const n = new Set(s);
                            if (n.has(it.id)) n.delete(it.id);
                            else n.add(it.id);
                            return n;
                          })
                        }
                        className="absolute top-2 left-2 size-6 cursor-pointer appearance-none rounded-md border-[1.5px] border-ink bg-white checked:bg-mint"
                      />
                      <div
                        className={`absolute inset-x-2 bottom-2 flex gap-1.5 ${focus === i ? "" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"}`}
                      >
                        <button
                          type="button"
                          onClick={() => act([it.id], "approve")}
                          className="h-8 flex-1 rounded-[9px] border-[1.5px] border-ink bg-mint-soft text-xs font-extrabold"
                        >
                          Setujui
                        </button>
                        <button
                          type="button"
                          onClick={() => act([it.id], "reject")}
                          className="h-8 flex-1 rounded-[9px] border-[1.5px] border-ink bg-coral text-xs font-extrabold"
                        >
                          Tolak
                        </button>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-bold">{it.name}</span>
                  <span className="font-mono text-[11px] text-text-2">{it.time}</span>
                </div>
                {it.wa && (
                  <a
                    href={`https://wa.me/${it.wa}`}
                    target="_blank"
                    rel="noreferrer"
                    className="-mt-1 truncate font-mono text-[11px] text-text-2 no-underline hover:underline"
                  >
                    +{it.wa}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {sel.size > 0 && canEdit && (
        <div className="sticky bottom-4 mx-5 mb-5 flex items-center gap-3 rounded-[14px] border-[1.5px] border-ink bg-ink px-4 py-2.5 text-paper">
          <span className="flex-1 text-sm font-bold">{sel.size} dipilih</span>
          <button
            type="button"
            onClick={() => act([...sel], "approve")}
            className="h-9 rounded-[10px] border-[1.5px] border-paper bg-mint-soft px-3 text-xs font-extrabold text-ink"
          >
            Setujui semua
          </button>
          <button
            type="button"
            onClick={() => act([...sel], "reject")}
            className="h-9 rounded-[10px] border-[1.5px] border-paper bg-coral px-3 text-xs font-extrabold text-ink"
          >
            Tolak semua
          </button>
          <button
            type="button"
            onClick={() => setSel(new Set())}
            className="text-xs font-bold underline"
          >
            Batal
          </button>
        </div>
      )}
    </div>
  );
}
