"use client";
import { Archive, ArchiveRestore } from "lucide-react";
import { useState, useTransition } from "react";
import { setArchived } from "./archive";

/** Kartu paling bawah Pengaturan: arsipkan event dobel/uji, atau kembalikan dari arsip. Dua langkah, tanpa confirm(). */
export function ArchivePanel({ eventId, archived }: { eventId: string; archived: boolean }) {
  const [ask, setAsk] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = () =>
    start(async () => {
      const r = await setArchived(eventId, !archived);
      setError(r.error);
      setAsk(false);
    });
  const btn =
    "pressable inline-flex h-10 items-center gap-2 rounded-full border-[1.5px] border-ink px-4 text-[13px] font-bold disabled:opacity-50";
  return (
    <section
      data-testid="archive-panel"
      className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-[1.5px] border-dashed border-ink bg-white px-5 py-4"
    >
      <div className="min-w-0">
        <h2 className="text-[15px] font-extrabold">
          {archived ? "Event ini ada di arsip" : "Arsipkan event"}
        </h2>
        <p className="mt-0.5 text-[13px] text-text-2">
          {archived
            ? "Tersembunyi dari daftar event dan booth. Kembalikan kalau ternyata masih dipakai."
            : "Untuk event dobel atau uji coba. Hilang dari daftar event dan booth; foto dan galeri klien tidak dihapus."}
        </p>
        {error && (
          <p role="alert" className="mt-1 text-[13px] font-semibold text-coral-strong">
            {error}
          </p>
        )}
      </div>
      {ask ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={run}
            className={`${btn} ${archived ? "bg-mint-soft" : "bg-coral-strong"}`}
          >
            {archived ? "Ya, kembalikan" : "Ya, arsipkan"}
          </button>
          <button type="button" onClick={() => setAsk(false)} className={`${btn} bg-white`}>
            Batal
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAsk(true)} className={`${btn} bg-white`}>
          {archived ? (
            <ArchiveRestore aria-hidden className="size-4" strokeWidth={2} />
          ) : (
            <Archive aria-hidden className="size-4" strokeWidth={2} />
          )}
          {archived ? "Kembalikan dari arsip" : "Arsipkan"}
        </button>
      )}
    </section>
  );
}
