"use client";
import type { GuestMe, GuestPrintInfo } from "@tetra/shared";
import { ChevronLeft, Download, Printer } from "lucide-react";
import { useEffect, useState } from "react";
import { GuestPromo, PROMO_SAVED } from "@/components/GuestPromo";
import { PhotoViewer } from "@/components/PhotoViewer";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import type { GuestPromo as Promo } from "@/lib/promo";
import { firstName, H1, Lead } from "./ui";

const t = copy.guestCam;
type Item = {
  key: string;
  url: string;
  thumb: string;
  strip?: boolean;
  by?: string;
  waiting?: boolean;
  booth?: boolean;
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
  print,
  onBack,
}: {
  token: string;
  info: GuestInfo;
  me: GuestMe;
  pending: number;
  promo: Promo | null;
  /** Cetak di booth (#223): status antrean, atau "error" kalau gagal dikirim. */
  print?: GuestPrintInfo | "error" | undefined;
  onBack: () => void;
}) {
  // Album dipisah per sumber (#247): Snapbook = foto HP tamu; Photobooth hanya kalau galeri publik dibuka klien.
  const [tab, setTab] = useState<"mine" | "album" | "booth">("mine");
  const [album, setAlbum] = useState<Item[] | null>(null);
  // Penampil besar (revisi 9 Okt): indeks foto di daftar tab aktif; geser kiri/kanan lewat PhotoViewer.
  const [view, setView] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const used = me.usedIdx.length + pending;

  // Dimuat sekali sejak layar dibuka (dulu baru saat tab diketuk = album terasa lambat).
  useEffect(() => {
    if (!me.revealed || album) return;
    void fetch(`/api/c/${encodeURIComponent(token)}/album`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then(
        (d: {
          items: {
            id: string;
            url: string;
            thumb: string;
            strip: boolean;
            by: string;
            source: "snapbook" | "booth";
          }[];
        }) =>
          setAlbum(
            d.items.map((i) => ({
              key: i.id,
              url: i.url,
              thumb: i.thumb,
              strip: i.strip,
              by: i.by,
              booth: i.source === "booth",
            })),
          ),
      )
      .catch(() => setAlbum([]));
  }, [me.revealed, album, token]);

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
  const boothItems = (album ?? []).filter((p) => p.booth);
  const tabs = ["mine", "album", ...(boothItems.length ? (["booth"] as const) : [])] as const;
  const list =
    tab === "mine" ? mine : tab === "booth" ? boothItems : (album ?? []).filter((p) => !p.booth);

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
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-extrabold">{info.name}</div>
            <div className="font-mono text-[11px] text-muted">
              {t.mineSub(firstName(me.name), used, info.shots)}
            </div>
          </div>
          {/* Save semua di header (dulu tombol besar di bawah grid menghalangi foto & kartu promo). */}
          {tab === "mine" && me.revealed && mine.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await saveFiles(mine.map((p) => p.url)).finally(() => setBusy(false));
              }}
              className="flex h-10 flex-none items-center gap-1.5 rounded-full bg-butter px-3.5 text-[13px] font-extrabold text-ink transition active:scale-95 disabled:opacity-60"
            >
              <Download size={16} />
              {busy ? t.savingAll : t.saveAllShort}
            </button>
          )}
        </div>
        <div className="mt-3 flex h-11 rounded-full bg-white/10 p-1">
          {tabs.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={tab === k}
              onClick={() => setTab(k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full text-sm font-bold ${tab === k ? "bg-paper text-ink" : "text-paper/70"}`}
            >
              {k === "mine" ? t.tabMine : k === "booth" ? t.tabBooth : t.tabAlbum}
              {k === "mine" && me.revealed && (
                <span className="font-mono text-xs">{mine.length}</span>
              )}
            </button>
          ))}
        </div>
        {print && (
          <div
            role="status"
            data-testid="guest-print"
            className={`mt-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-ink ${print === "error" || print.status === "failed" ? "bg-coral" : print.status === "printed" ? "bg-mint" : "bg-butter"}`}
          >
            <Printer size={20} className="flex-none" />
            {print === "error" ? (
              <span className="text-sm font-bold">{t.printFailed}</span>
            ) : (
              <span className="text-sm">
                <span className="block font-extrabold">{t.printTitle(print.number)}</span>
                {t.printState[print.status]}
              </span>
            )}
          </div>
        )}
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
              {list.map((p, i) => (
                <li key={p.key} className="relative aspect-[3/4] overflow-hidden bg-white/10">
                  <button
                    type="button"
                    onClick={() => setView(i)}
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
          ) : tab !== "mine" && !album ? (
            <ul className="grid grid-cols-3 gap-[3px] px-[3px]" aria-hidden>
              {Array.from({ length: 9 }, (_, n) => n).map((i) => (
                <li key={i} className="aspect-[3/4] animate-pulse bg-white/10" />
              ))}
            </ul>
          ) : (
            <p className="px-5 pt-10 text-center text-sm text-muted">{t.empty}</p>
          )}
          <div className="h-6 flex-1" />
        </>
      )}

      {promo && <GuestPromo promo={promo} />}

      {view !== null && list[view] && (
        <PhotoViewer
          items={list.map((p) => ({ src: p.url, thumb: p.thumb }))}
          index={view}
          onIndex={setView}
          onClose={() => setView(null)}
        >
          {list[view].by && (
            <span className="self-center text-sm font-bold text-paper">oleh {list[view].by}</span>
          )}
          <button
            type="button"
            onClick={() => void saveFiles([list[view]?.url ?? ""])}
            className="pressable h-12 rounded-[14px] border-[1.5px] border-ink bg-butter px-3 text-[15px] font-extrabold text-ink"
          >
            {t.saveHp}
          </button>
        </PhotoViewer>
      )}
    </main>
  );
}
