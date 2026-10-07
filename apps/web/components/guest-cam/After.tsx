"use client";
import type { GuestMe } from "@tetra/shared";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { CameraArt } from "./CameraArt";
import { firstName, H1, Lead, Primary, Screen, TextLink } from "./ui";

const t = copy.guestCam;
type Item = {
  key: string;
  url: string;
  thumb: string;
  strip?: boolean;
  by?: string;
  waiting?: boolean;
};

/** Kartu aksi gelap (ucapan / strip). */
function ActionCard({
  icon,
  title,
  sub,
  off,
  onClick,
}: {
  icon: "tape" | "strip";
  title: string;
  sub: string;
  off?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={off}
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-3xl bg-white/10 p-4 text-left transition-transform active:scale-[.98] disabled:opacity-50"
    >
      <span
        className={`flex size-14 flex-none items-center justify-center rounded-2xl ${icon === "tape" ? "bg-peach" : "bg-lavender"}`}
      >
        {icon === "tape" ? (
          <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden>
            <rect x="1" y="1" width="28" height="20" rx="3" fill="#1D1D1B" />
            <rect x="5" y="5" width="20" height="8" rx="4" fill="#F8F7F4" />
            <circle cx="10" cy="9" r="2.5" fill="#1D1D1B" />
            <circle cx="20" cy="9" r="2.5" fill="#1D1D1B" />
          </svg>
        ) : (
          <span className="flex h-9 w-5 flex-col gap-0.5 rounded-sm bg-white p-0.5" aria-hidden>
            <span className="flex-1 bg-text-2" />
            <span className="flex-1 bg-text-2" />
            <span className="flex-1 bg-text-2" />
          </span>
        )}
      </span>
      <span className="flex-1">
        <span className="block text-base font-extrabold">{title}</span>
        <span className="mt-0.5 block text-[13px] text-paper/65">{sub}</span>
      </span>
      {!off && <span className="text-xl text-paper/60">›</span>}
    </button>
  );
}

/** Jatah habis. Tidak ada janji kabar WhatsApp (DECISIONS #203). */
export function Done({
  info,
  me,
  voice,
  strip,
  onVoice,
  onStrip,
  onMine,
}: {
  info: GuestInfo;
  me: GuestMe;
  voice: boolean;
  strip: "on" | "locked" | "wait" | "off";
  onVoice: () => void;
  onStrip: () => void;
  onMine: () => void;
}) {
  return (
    <Screen bottom={<Primary onClick={onMine}>{t.seeMine}</Primary>}>
      <div className="mt-[8dvh] flex items-end justify-center gap-3">
        <CameraArt id="disposable" body="#8EDCCB" size={110} />
        <span className="mb-3 rounded-full bg-peach px-3 py-1 font-mono text-sm text-ink">
          {info.shots}/{info.shots}
        </span>
      </div>
      <p className="mt-6 text-center text-xs font-bold tracking-[0.14em] text-muted uppercase">
        {t.filmOut}
      </p>
      <H1 className="mt-2 text-center">{t.thanks(firstName(me.name))}</H1>
      <Lead className="text-center">
        {info.reveal === "after" && !me.revealed ? t.doneAfter : t.doneLive}
      </Lead>
      <div className="mt-8 flex flex-col gap-3">
        {voice && (
          <ActionCard icon="tape" title={t.voiceCard} sub={t.voiceCardSub} onClick={onVoice} />
        )}
        {strip !== "off" && (
          <ActionCard
            icon="strip"
            title={t.stripCard}
            sub={
              strip === "locked"
                ? t.stripCardLocked
                : strip === "wait"
                  ? t.stripCardWait
                  : t.stripCardOpen
            }
            off={strip !== "on"}
            onClick={onStrip}
          />
        )}
      </div>
    </Screen>
  );
}

async function saveFiles(urls: string[]) {
  const files = await Promise.all(
    urls.map(async (u, i) => {
      const b = await (await fetch(u)).blob();
      return new File([b], `tetra-guest-${i + 1}.jpg`, { type: "image/jpeg" });
    }),
  );
  if (navigator.canShare?.({ files }))
    return void (await navigator.share({ files }).catch(() => {}));
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
  left,
  voice,
  strip,
  onCamera,
  onVoice,
  onStrip,
}: {
  token: string;
  info: GuestInfo;
  me: GuestMe;
  pending: number;
  left: number;
  voice: boolean;
  strip: boolean;
  onCamera: () => void;
  onVoice: () => void;
  onStrip: () => void;
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
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-[17px] font-extrabold">{info.name}</div>
            <div className="font-mono text-[11px] text-muted">
              {t.mineSub(firstName(me.name), used, info.shots)}
            </div>
          </div>
          {left > 0 && (
            <button
              type="button"
              onClick={onCamera}
              className="flex h-10 items-center gap-2 rounded-full bg-butter px-4 text-sm font-extrabold text-ink"
            >
              {t.keepShootingBtn} <span className="font-mono text-xs font-medium">{left}</span>
            </button>
          )}
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
          {voice && (
            <TextLink className="mt-4 self-start" onClick={onVoice}>
              {t.recordVoice}
            </TextLink>
          )}
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
                      Strip
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
            {tab === "mine" && (voice || strip) && (
              <div className="flex gap-2">
                {voice && (
                  <button
                    type="button"
                    onClick={onVoice}
                    className="h-12 flex-1 rounded-full bg-white/10 text-sm font-bold"
                  >
                    {t.voiceCard}
                  </button>
                )}
                {strip && (
                  <button
                    type="button"
                    onClick={onStrip}
                    className="h-12 flex-1 rounded-full bg-white/10 text-sm font-bold"
                  >
                    {t.stripCard}
                  </button>
                )}
              </div>
            )}
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
