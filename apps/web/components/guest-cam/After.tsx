"use client";
import type { GuestMe } from "@tetra/shared";
import { ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { GuestPromo, PROMO_SAVED } from "@/components/GuestPromo";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import type { GuestPromo as Promo } from "@/lib/promo";
import { firstName, H1, Lead, Primary } from "./ui";

const t = copy.guestCam;
type Item = {
  key: string;
  url: string;
  thumb: string;
  strip?: boolean;
  by?: string;
  waiting?: boolean;
};

async function saveFiles(urls: string[]) {
  const files = await Promise.all(
    urls.map(async (u, i) => {
      const b = await (await fetch(u)).blob();
      return new File([b], `tetra-guest-${i + 1}.jpg`, { type: "image/jpeg" });
    }),
  );
  // Simpan berhasil → pop-up promosi sekali (#215); batal share tidak dihitung.
  const saved = () => window.dispatchEvent(new Event(PROMO_SAVED));
  if (navigator.canShare?.({ files }))
    return void (await navigator.share({ files }).then(saved, () => {}));
  saved();
  for (const f of files) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
  }
}

/** Foto saya / Album acara (tab) + roll terkunci untuk mode setelah acara. */
export function Mine({
  token,
  info,
  me,
  pending,
  promo,
  onBack,
}: {
  token: string;
  info: GuestInfo;
  me: GuestMe;
  pending: number;
  promo: Promo | null;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"mine" | "album">("mine");
  const [album, setAlbum] = useState<Item[] | null>(null);
  const [view, setView] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const used = me.usedIdx.length + pending;

  useEffect(() => {
    if (tab !== "album" || album) return;
    void fetch(`/api/c/${encodeURIComponent(token)}/album`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then(
        (d: { items: { id: string; url: string; thumb: string; strip: boolean; by: string }[] }) =>
          setAlbum(
            d.items.map((i) => ({
              key: i.id,
              url: i.url,
              thumb: i.thumb,
              strip: i.strip,
              by: i.by,
            })),
          ),
      )
      .catch(() => setAlbum([]));
  }, [tab, album, token]);

  const mine: Item[] = [
    ...me.strips.map((p) => ({
      key: `s${p.idx}`,
      url: p.url,
      thumb: p.thumbUrl ?? p.url,
      strip: true,
      waiting: p.waiting,
    })),
    ...me.photos.map((p) => ({
      key: `p${p.idx}`,
      url: p.url,
      thumb: p.thumbUrl ?? p.url,
      waiting: p.waiting,
    })),
  ];
  const list = tab === "mine" ? mine : (album ?? []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col bg-black text-paper">
      <div className="sticky top-0 z-10 bg-black px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t.back}
            className="flex size-11 flex-none items-center justify-center rounded-full bg-white/10 transition active:scale-90"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="min-w-0">
            <div className="truncate text-[17px] font-extrabold">{info.name}</div>
            <div className="font-mono text-[11px] text-muted">
              {t.mineSub(firstName(me.name), used, info.shots)}
            </div>
          </div>
        </div>
        <div className="mt-3 flex h-11 rounded-full bg-white/10 p-1">
          {(["mine", "album"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold ${tab === k ? "bg-paper text-ink" : "text-paper/70"}`}
            >
              {k === "mine" ? t.tabMine : t.tabAlbum}
              {k === "mine" && me.revealed && (
                <span className="font-mono text-xs">{mine.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {!me.revealed ? (
        <div className="flex flex-1 flex-col px-5 pt-6">
          <H1>{t.developing}</H1>
          <Lead>{t.developingBody}</Lead>
          <div className="mt-6 rounded-3xl bg-white/10 p-5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold">{t.roll(firstName(me.name))}</span>
              <span className="font-mono text-sm">
                {String(used).padStart(2, "0")}/{info.shots}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2" aria-hidden>
              {Array.from({ length: info.shots }, (_, n) => n).map((i) => (
                <span
                  key={i}
                  className={`flex aspect-[3/4] items-end rounded-md px-1 py-0.5 font-mono text-[10px] ${i < used ? "bg-[#4a2f1a] text-[#FF9A3C]" : "border border-dashed border-paper/25"}`}
                >
                  {i < used ? String(i + 1).padStart(2, "0") : ""}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[13px] text-paper/70">
              {t.opens}: <b className="text-paper">{t.afterEvent}</b>
            </p>
          </div>
        </div>
      ) : (
        <>
          {tab === "mine" && info.approval === "manual" && (
            <p className="mx-4 mb-2 rounded-2xl bg-white/10 px-3.5 py-2.5 text-xs leading-[1.5] text-paper/80">
              {t.reviewNote}
            </p>
          )}
          {list.length ? (
            <ul className="grid grid-cols-3 gap-[3px] px-[3px]">
              {list.map((p) => (
                <li key={p.key} className="relative aspect-[3/4] overflow-hidden bg-white/10">
                  <button
                    type="button"
                    onClick={() => setView(p)}
                    className="block size-full"
                    aria-label={p.by ? `Foto oleh ${p.by}` : "Lihat foto"}
                  >
                    {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
                    <img
                      src={p.thumb}
                      alt=""
                      loading="lazy"
                      className={`size-full ${p.strip ? "object-contain bg-white" : "object-cover"}`}
                    />
                  </button>
                  {p.waiting && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-peach px-2 py-0.5 text-[10px] font-extrabold text-ink">
                      {t.reviewing}
                    </span>
                  )}
                  {p.by && (
                    <span className="absolute bottom-1.5 left-1.5 max-w-[90%] truncate rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold">
                      {p.by}
                    </span>
                  )}
                  {p.strip && !p.by && (
                    <span className="absolute top-1.5 left-1.5 rounded-full bg-butter px-2 py-0.5 text-[10px] font-extrabold text-ink">
                      Frame
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pt-10 text-center text-sm text-muted">
              {tab === "album" && !album ? "…" : t.empty}
            </p>
          )}
          <div className="flex-1" />
          <div className="flex flex-col gap-3 px-4 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]">
            {tab === "mine" && mine.length > 0 && (
              <Primary
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  await saveFiles(mine.map((p) => p.url)).finally(() => setBusy(false));
                }}
              >
                {busy ? t.savingAll : t.saveAll}
              </Primary>
            )}
          </div>
        </>
      )}

      {promo && <GuestPromo promo={promo} />}

      {view && (
        <div
          className="fixed inset-0 z-30 mx-auto flex max-w-[480px] flex-col bg-black"
          role="dialog"
          aria-label="Foto"
        >
          <div className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-2">
            <button
              type="button"
              onClick={() => setView(null)}
              aria-label={t.close}
              className="flex size-10 items-center justify-center rounded-full bg-white/10"
            >
              ✕
            </button>
            {view.by && <span className="text-sm font-bold">oleh {view.by}</span>}
            <button
              type="button"
              onClick={() => void saveFiles([view.url])}
              className="h-10 rounded-full bg-paper px-4 text-sm font-extrabold text-ink"
            >
              {t.saveHp}
            </button>
          </div>
          {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
          <img src={view.url} alt="" className="min-h-0 flex-1 object-contain" />
        </div>
      )}
    </main>
  );
}
