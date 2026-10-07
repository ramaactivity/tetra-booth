"use client";
import type { GuestMe } from "@tetra/shared";
import { useState } from "react";
import { renderStrip } from "@/app/c/[token]/strip";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { H1, Head, longDateId, Primary, Screen, Secondary } from "./ui";

const t = copy.guestCam;

/**
 * A9 Strip virtual (StripPicker): pilih foto sebanyak slot desain utama (nomor urut di lingkaran mint, foto lain
 * nonaktif saat penuh) → pratinjau hasil template engine (frame acara) → simpan ke HP / kirim ke album.
 * Urutan strip = urutan pilih (penyesuaian dari "tahan lalu geser", DECISIONS #203).
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
  /** Nomor strip yang sedang dibuat (1–5). */
  k: number;
  onSend: (shot: { main: Blob; thumb: Blob }) => Promise<void>;
  onClose: () => void;
}) {
  const design = info.design;
  const n = design?.layout.slots.length ?? 0;
  const [picked, setPicked] = useState<number[]>([]);
  const [made, setMade] = useState<{ main: Blob; thumb: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!design) return null;
  const full = picked.length >= n;

  if (made)
    return (
      <Screen
        bottom={
          <div className="flex gap-3">
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
        }
      >
        <Head
          title={t.yourStrip}
          onBack={() => setMade(null)}
          backLabel={t.back}
          right={<span className="font-mono text-[11px] text-text-2">{t.stripOfShort(k)}</span>}
        />
        <div className="mt-[22px] flex justify-center">
          {/* biome-ignore lint/performance/noImgElement: object URL hasil render lokal */}
          <img
            src={made.url}
            alt={t.yourStrip}
            className="layered max-h-[56dvh] w-auto rounded-md border-[1.5px] border-ink bg-white [--lb:1.5px] [--lx:6px]"
          />
        </div>
        <p className="mt-5 self-center font-mono text-[11px] text-text-2">{t.stripNote}</p>
      </Screen>
    );

  return (
    <Screen
      bottom={
        <Primary
          disabled={!full || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const urls = picked.map((i) => me.photos.find((p) => p.idx === i)?.url ?? "");
              const r = await renderStrip(
                design,
                urls,
                { event_name: info.name, date: longDateId(info.date) },
                location.origin + info.link,
              );
              setMade({ ...r, url: URL.createObjectURL(r.main) });
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? t.making : t.seeStrip}
        </Primary>
      }
    >
      <Head title={info.name} sub={t.stripOf(k)} onClose={onClose} />
      <div className="mt-7 flex items-end justify-between">
        <H1>{t.pick(n)}</H1>
        <span className="flex h-[30px] items-center rounded-full border-[1.5px] border-ink bg-mint-soft px-3 font-mono text-[13px]">
          {picked.length}/{n}
        </span>
      </div>
      <ul className="mt-[18px] grid grid-cols-3 gap-2">
        {me.photos.map((p) => {
          const at = picked.indexOf(p.idx);
          const off = at < 0 && full;
          return (
            <li key={p.idx}>
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
                className={`relative block aspect-[3/4] w-full overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-neutral disabled:opacity-45 ${at >= 0 ? "shadow-[0_0_0_3px_var(--mint)]" : ""}`}
              >
                {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
                <img src={p.thumbUrl ?? p.url} alt="" className="size-full object-cover" />
                <span
                  className={`absolute top-1.5 right-1.5 flex size-[26px] items-center justify-center rounded-full border-[1.5px] border-ink font-mono text-[13px] ${at >= 0 ? "bg-mint" : "bg-white"}`}
                >
                  {at >= 0 ? at + 1 : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Screen>
  );
}
