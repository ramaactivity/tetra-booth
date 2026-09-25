"use client";
import { useRef, useState } from "react";

/** Pengaturan galeri (desain v2 C4): toggle galeri publik, salin link, tanggal penghapusan. */
export function GallerySettings({
  token,
  enabled: initial,
  deleteOn,
}: {
  token: string;
  enabled: boolean;
  deleteOn: string | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [enabled, setEnabled] = useState(initial);
  const [copied, setCopied] = useState(false);
  const toggle = async () => {
    const res = await fetch(`/api/g/${token}/public-gallery`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    if (res.ok) setEnabled(!enabled);
  };
  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        className="h-9 self-start rounded-[10px] border-[1.5px] border-ink bg-white px-3.5 text-[13px] font-bold"
      >
        ⚙ Pengaturan
      </button>
      <dialog
        ref={ref}
        aria-label="Pengaturan Galeri"
        className="mx-auto mt-auto mb-3 w-[calc(100vw-24px)] max-w-[480px] rounded-[28px] border-[1.5px] border-ink bg-white p-5 backdrop:bg-ink/40 md:m-auto"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[22px] font-extrabold tracking-[-0.02em]">Pengaturan Galeri</h2>
            <button
              type="button"
              aria-label="Tutup"
              onClick={() => ref.current?.close()}
              className="flex size-9 items-center justify-center rounded-full border-[1.5px] border-ink"
            >
              ✕
            </button>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] border-ink p-3.5">
            <span className="flex-1">
              <span className="block text-[15px] font-bold">Galeri publik</span>
              <span className="mt-0.5 block text-xs leading-normal text-text-2">
                Kalau aktif, tamu bisa lihat semua foto acara dari halaman foto mereka
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              aria-checked={enabled}
              checked={enabled}
              onChange={toggle}
              className="peer sr-only"
            />
            <span className="relative h-7 w-12 flex-none rounded-full border-[1.5px] border-ink bg-neutral transition-colors peer-checked:bg-mint after:absolute after:top-[3px] after:left-[3px] after:size-[19px] after:rounded-full after:border-[1.5px] after:border-ink after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
          </label>
          <div className="flex flex-col gap-2 rounded-2xl border-[1.5px] border-dashed border-ink bg-sky p-3.5">
            <span className="text-xs font-bold">Bagikan galeri</span>
            <div className="flex gap-2">
              <span className="flex h-10 min-w-0 flex-1 items-center truncate rounded-lg border-[1.5px] border-ink bg-white px-2.5 font-mono text-xs">
                /g/{token.slice(0, 6)}…
              </span>
              <button
                type="button"
                onClick={() =>
                  navigator.clipboard.writeText(window.location.href).then(() => setCopied(true))
                }
                className="h-10 rounded-lg border-[1.5px] border-ink bg-butter px-3 text-[13px] font-bold"
              >
                {copied ? "Tersalin" : "Salin Link"}
              </button>
            </div>
            <p className="text-xs leading-normal text-text-3">
              Link ini hanya untuk kamu dan keluarga. Jangan dibagikan ke publik kalau galeri
              privat.
            </p>
          </div>
          {deleteOn && (
            <p className="text-center text-xs font-semibold text-text-2">
              Semua foto akan dihapus pada {deleteOn}
            </p>
          )}
        </div>
      </dialog>
    </>
  );
}
