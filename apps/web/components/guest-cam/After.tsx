"use client";
import type { GuestMe } from "@tetra/shared";
import { useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { Card, dotDate, firstName, H1, Head, Lead, Primary, Screen, TextLink } from "./ui";

const t = copy.guestCam;

/** Kartu aksi (A5): ucapan suara / strip. `off` = belum bisa, kotak putus-putus abu. */
function ActionCard({
  icon,
  title,
  sub,
  off,
  onClick,
}: {
  icon: "mic" | "strip";
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
      className={`flex w-full items-center gap-3.5 rounded-[18px] border-[1.5px] border-ink p-4 text-left ${off ? "border-dashed text-text-2" : "bg-white"}`}
    >
      <span
        className={`flex size-[52px] flex-none items-center justify-center rounded-[14px] border-[1.5px] border-dashed ${off ? "border-muted" : "border-ink bg-lavender"}`}
      >
        {icon === "mic" ? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" x2="12" y1="19" y2="22" />
          </svg>
        ) : (
          <span className="grid h-9 w-[22px] grid-rows-3 gap-[3px]" aria-hidden>
            <span className="rounded-[3px] bg-line-soft" />
            <span className="rounded-[3px] bg-line-soft" />
            <span className="rounded-[3px] bg-line-soft" />
          </span>
        )}
      </span>
      <span className="flex-1">
        <span
          className={`block font-extrabold tracking-[-0.01em] ${off ? "text-sm text-text-3" : "text-[15px]"}`}
        >
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-text-2">{sub}</span>
      </span>
    </button>
  );
}

/** A5 Jatah habis. Tidak ada janji kabar WhatsApp (DECISIONS #203). */
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
    <Screen
      bottom={
        <>
          {voice ? (
            <Primary onClick={onVoice}>{t.recordVoice}</Primary>
          ) : (
            <Primary onClick={onMine}>{t.seeMine}</Primary>
          )}
          {voice && <TextLink onClick={onMine}>{t.seeMine}</TextLink>}
        </>
      }
    >
      <Head title={info.name} sub={dotDate(info.date)} />
      <Card className="mt-8 flex items-center justify-between bg-peach max-[380px]:mt-5">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-bold">{t.filmOut}</span>
          <span className="max-w-[170px] text-[15px] leading-[1.4] font-semibold">
            {t.filmOutBody}
          </span>
        </div>
        <div className="flex size-24 flex-col items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white">
          <span className="font-mono text-[40px] leading-none font-medium">{info.shots}</span>
          <span className="font-mono text-[11px]">/{info.shots}</span>
        </div>
      </Card>
      <H1 className="mt-7 text-[30px] leading-[1.06]">{t.thanks(firstName(me.name))}</H1>
      <Lead>{info.reveal === "after" && !me.revealed ? t.doneAfter : t.doneLive}</Lead>
      <div className="mt-[26px] flex flex-col gap-3">
        {voice && (
          <ActionCard icon="mic" title={t.voiceCard} sub={t.voiceCardSub} onClick={onVoice} />
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

/** Simpan banyak foto: share sheet berisi file (masuk galeri HP), atau unduh satu per satu. */
async function saveAll(urls: string[]) {
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

/** A7a Foto saya (+ strip, label "Ditinjau") / A7b terkunci "lagi dicuci" (reveal setelah acara). */
export function Mine({
  info,
  me,
  pending,
  left,
  galleryUrl,
  voice,
  strip,
  onCamera,
  onVoice,
  onStrip,
}: {
  info: GuestInfo;
  me: GuestMe;
  pending: number;
  left: number;
  galleryUrl: string | null;
  voice: boolean;
  strip: boolean;
  onCamera: () => void;
  onVoice: () => void;
  onStrip: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const used = me.usedIdx.length + pending;
  const name = firstName(me.name);

  if (!me.revealed)
    return (
      <Screen
        bottom={
          left > 0 && (
            <Primary onClick={onCamera}>
              {t.keepShootingBtn}
              <span className="flex h-6 items-center rounded-full border-[1.5px] border-ink bg-white px-2 font-mono text-[13px] font-medium">
                {t.left(left)}
              </span>
            </Primary>
          )
        }
      >
        <Head title={info.name} sub={dotDate(info.date)} />
        <H1 className="mt-8 text-[30px] leading-[1.06]">{t.developing}</H1>
        <Lead>{t.developingBody}</Lead>
        <Card className="mt-6 flex flex-col gap-4 bg-ink text-paper">
          <div className="flex items-baseline justify-between">
            <span className="text-[13px] font-bold">{t.roll(name)}</span>
            <span className="font-mono text-[13px]">
              {String(used).padStart(2, "0")}/{info.shots}
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2" aria-hidden>
            {Array.from({ length: info.shots }, (_, n) => n).map((i) => (
              <span
                key={i}
                className={`flex aspect-[3/4] items-end rounded-[7px] border-[1.5px] border-paper px-[5px] py-1 font-mono text-[10px] ${i < used ? "bg-text-3" : "border-dashed"}`}
              >
                {i < used ? String(i + 1).padStart(2, "0") : ""}
              </span>
            ))}
          </div>
          <div className="flex items-center justify-between border-t-[1.5px] border-dashed border-paper pt-3.5">
            <span className="text-[13px] font-semibold">{t.opens}</span>
            <span className="flex h-7 items-center rounded-full border-[1.5px] border-paper bg-peach px-2.5 text-xs font-extrabold text-ink">
              {t.afterEvent}
            </span>
          </div>
        </Card>
        {voice && (
          <TextLink className="mt-4 self-start" onClick={onVoice}>
            {t.recordVoice}
          </TextLink>
        )}
      </Screen>
    );

  const photos = me.photos;
  return (
    <Screen
      bottom={
        <>
          <Primary
            disabled={!photos.length || busy}
            onClick={async () => {
              setBusy(true);
              await saveAll([...photos, ...me.strips].map((p) => p.url)).finally(() =>
                setBusy(false),
              );
            }}
          >
            {busy ? t.savingAll : t.saveAll}
          </Primary>
          {left > 0 && <TextLink onClick={onCamera}>{t.keepShooting(left)}</TextLink>}
        </>
      }
    >
      <Head title={info.name} sub={t.mineSub(name, used, info.shots)} />
      <div className="mt-5 flex h-11 overflow-hidden rounded-[12px] border-[1.5px] border-ink bg-white">
        <span className="flex flex-1 items-center justify-center gap-1.5 border-r-[1.5px] border-ink bg-lavender text-sm font-bold">
          {t.tabMine} <span className="font-mono font-medium">{photos.length}</span>
        </span>
        {galleryUrl ? (
          <a
            href={galleryUrl}
            className="flex flex-1 items-center justify-center text-sm font-bold no-underline"
          >
            {t.tabAlbum}
          </a>
        ) : (
          <span className="flex flex-1 items-center justify-center text-sm font-bold text-muted">
            {t.tabAlbum}
          </span>
        )}
      </div>
      {info.approval === "manual" && (
        <p className="mt-3.5 rounded-[12px] border-[1.5px] border-dashed border-ink bg-sky px-3 py-2.5 text-xs leading-[1.5]">
          {t.reviewNote}
        </p>
      )}
      {photos.length ? (
        <ul className="mt-3.5 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <Thumb key={p.idx} url={p.url} thumb={p.thumbUrl} waiting={p.waiting} />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-text-2">{t.empty}</p>
      )}
      {me.strips.length > 0 && (
        <>
          <h2 className="mt-5 text-sm font-extrabold">{t.stripsMine}</h2>
          <ul className="mt-2 grid grid-cols-4 gap-2">
            {me.strips.map((p) => (
              <Thumb key={p.idx} url={p.url} thumb={p.thumbUrl} waiting={p.waiting} tall />
            ))}
          </ul>
        </>
      )}
      {(voice || strip) && (
        <div className="mt-5 grid grid-cols-2 gap-2">
          {voice && (
            <button
              type="button"
              onClick={onVoice}
              className="h-12 rounded-[12px] border-[1.5px] border-ink bg-white text-sm font-bold"
            >
              {t.recordVoice}
            </button>
          )}
          {strip && (
            <button
              type="button"
              onClick={onStrip}
              className="h-12 rounded-[12px] border-[1.5px] border-ink bg-white text-sm font-bold"
            >
              {t.stripCard}
            </button>
          )}
        </div>
      )}
    </Screen>
  );
}

function Thumb({
  url,
  thumb,
  waiting,
  tall,
}: {
  url: string;
  thumb?: string | undefined;
  waiting: boolean;
  tall?: boolean;
}) {
  return (
    <li
      className={`relative overflow-hidden rounded-[10px] border-[1.5px] border-ink bg-neutral ${tall ? "aspect-[1/3]" : "aspect-[3/4]"}`}
    >
      <a href={url} target="_blank" rel="noreferrer">
        {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
        <img
          src={thumb ?? url}
          alt=""
          loading="lazy"
          className={`size-full ${tall ? "object-contain" : "object-cover"}`}
        />
      </a>
      {waiting && (
        <span className="absolute bottom-[5px] left-[5px] flex h-[22px] items-center rounded-full border-[1.5px] border-ink bg-peach px-[7px] text-[10px] font-extrabold">
          {t.reviewing}
        </span>
      )}
    </li>
  );
}
