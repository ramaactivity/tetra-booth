"use client";
import type { GuestMe } from "@tetra/shared";
import { useEffect, useRef, useState } from "react";
import { renderStrip } from "@/app/c/[token]/strip";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { longDateId, Primary, Secondary, TopBar } from "./ui";

const t = copy.guestCam;

/**
 * Photo strip (#209): pratinjau strip berubah langsung tiap foto dipilih (slot kosong abu), foto dipilih dari
 * carousel bawah (nomor urut), lalu "Cetak strip" = render penuh + animasi strip keluar dari slot printer →
 * simpan ke HP / kirim ke album. Render lewat template engine yang sama dengan booth.
 */
export function StripPicker({
  info,
  me,
  k,
  onSend,
  onClose,
}: {
  info: GuestInfo;
  me: GuestMe;
  k: number;
  onSend: (shot: { main: Blob; thumb: Blob }) => Promise<void>;
  onClose: () => void;
}) {
  const design = info.design;
  const n = design?.layout.slots.length ?? 0;
  const [picked, setPicked] = useState<number[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [made, setMade] = useState<{ main: Blob; thumb: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);
  const vars = { event_name: info.name, date: longDateId(info.date) };
  const qr = typeof location === "undefined" ? "" : location.origin + info.link;
  const urls = () =>
    Array.from({ length: n }, (_, i) => me.photos.find((p) => p.idx === picked[i])?.url ?? null);

  // Pratinjau cepat (skala 0,35) tiap pilihan berubah; render lama yang telat dibuang.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dirender ulang hanya saat pilihan berubah
  useEffect(() => {
    if (!design || made) return;
    const id = ++seq.current;
    const timer = setTimeout(async () => {
      const r = await renderStrip(design, urls(), vars, qr, 0.35).catch(() => null);
      if (r && id === seq.current) {
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(r.thumb);
        });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [picked, made]);

  if (!design) return null;
  const full = picked.length >= n;

  return (
    <main className="mx-auto flex h-dvh w-full max-w-[480px] flex-col overflow-hidden bg-black px-4 pt-[max(12px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))] text-paper">
      <TopBar
        onBack={made ? () => setMade(null) : onClose}
        title={made ? t.yourStrip : t.pick(n)}
        sub={t.stripOf(k)}
        right={
          !made && (
            <span className="rounded-full bg-text-3 px-2.5 py-1 font-mono text-xs">
              {picked.length}/{n}
            </span>
          )
        }
      />

      {/* Slot printer + strip */}
      <div className="relative mt-3 flex min-h-0 flex-1 flex-col items-center">
        <div className="z-10 h-3 w-[72%] flex-none rounded-full bg-text-3 shadow-[inset_0_2px_4px_rgba(0,0,0,.6)]" />
        <div className="-mt-1.5 flex min-h-0 flex-1 justify-center overflow-hidden px-6 pt-1.5">
          {made ? (
            // biome-ignore lint/performance/noImgElement: object URL hasil render lokal
            <img
              src={made.url}
              alt={t.yourStrip}
              className="max-h-full w-auto self-start rounded-sm bg-white shadow-[0_16px_40px_rgba(0,0,0,.6)] motion-safe:animate-[strip-out_1.4s_cubic-bezier(.2,.7,.2,1)_both]"
            />
          ) : preview ? (
            // biome-ignore lint/performance/noImgElement: object URL hasil render lokal
            <img
              src={preview}
              alt="Pratinjau strip"
              className="max-h-full w-auto self-start rounded-sm bg-white opacity-95"
            />
          ) : (
            <div className="aspect-[1/3] h-full max-h-full animate-pulse rounded-sm bg-text-3" />
          )}
        </div>
      </div>

      {made ? (
        <div className="mt-4 flex flex-none gap-3">
          <Secondary
            onClick={async () => {
              const file = new File([made.main], `strip-${k}.jpg`, { type: "image/jpeg" });
              if (navigator.canShare?.({ files: [file] }))
                return void (await navigator.share({ files: [file] }).catch(() => {}));
              const a = document.createElement("a");
              a.href = made.url;
              a.download = file.name;
              a.click();
            }}
          >
            {t.saveHp}
          </Secondary>
          <Primary
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSend(made);
            }}
          >
            {t.sendAlbum}
          </Primary>
        </div>
      ) : (
        <>
          <ul className="mt-4 flex flex-none gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {me.photos.map((p) => {
              const at = picked.indexOf(p.idx);
              const off = at < 0 && full;
              return (
                <li key={p.idx} className="flex-none">
                  <button
                    type="button"
                    aria-pressed={at >= 0}
                    disabled={off}
                    onClick={() =>
                      setPicked((s) =>
                        s.includes(p.idx)
                          ? s.filter((x) => x !== p.idx)
                          : s.length < n
                            ? [...s, p.idx]
                            : s,
                      )
                    }
                    className={`relative block h-[92px] w-[69px] overflow-hidden rounded-xl bg-text-3 disabled:opacity-35 ${at >= 0 ? "ring-[3px] ring-butter" : ""}`}
                  >
                    {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
                    <img src={p.thumbUrl ?? p.url} alt="" className="size-full object-cover" />
                    {at >= 0 && (
                      <span className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-butter font-mono text-xs font-bold text-ink">
                        {at + 1}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <Primary
            className="mt-4 flex-none"
            disabled={!full || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await renderStrip(design, urls(), vars, qr);
                setMade({ ...r, url: URL.createObjectURL(r.main) });
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t.making : t.seeStrip}
          </Primary>
        </>
      )}
    </main>
  );
}
