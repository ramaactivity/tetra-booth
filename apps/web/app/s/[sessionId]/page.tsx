import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { GuestPromo } from "@/components/GuestPromo";
import { copy } from "@/lib/copy";
import { clock, type GuestEvent, loadGuest, longDate, shortDate } from "@/lib/guest";
import { loadPromoForSession } from "@/lib/promo";
import { AutoRefresh } from "./AutoRefresh";
import { GuestReady } from "./GuestReady";
import { LeadSheet } from "./LeadSheet";
import { StageGuest } from "./StageGuest";
import { TrackOpen } from "./TrackOpen";

/** Halaman tamu dari QR booth (FSD §2, desain v2 B1–B3). Mobile-first 390 px. */
export const metadata: Metadata = {
  title: "Foto kamu · Tetra Photobooth",
  robots: { index: false, follow: false },
};

const t = copy.guest;
const CONTACT_URL = "https://tetraphoto.com";

/** Teks ink di atas warna terang, putih di atas warna gelap. */
const onColor = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150
    ? "#1d1d1b"
    : "#ffffff";
};

/**
 * Hero halaman tamu (#217): nama acara besar seperti layar booth, tagline, tanggal mono. Warna header event mengisi
 * seluruh hero; `ready` = pill "Fotomu sudah jadi" (kesan pertama setelah scan QR).
 */
function Header({ event, ready }: { event?: GuestEvent | undefined; ready?: boolean }) {
  const bg = event?.color;
  return (
    <header
      className="border-b-[1.5px] border-dashed border-ink px-5 pt-6 pb-6"
      style={bg ? { background: bg, color: onColor(bg), borderStyle: "solid" } : undefined}
    >
      <div className="animate-rise flex items-center justify-between gap-3">
        {event?.logoUrl ? (
          <img src={event.logoUrl} alt="" className="h-10 max-w-[140px] object-contain" />
        ) : (
          <span className="flex items-center gap-2 text-sm font-extrabold tracking-[-0.02em]">
            <span className="flex size-8 items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-mint text-sm font-extrabold text-ink">
              T
            </span>
            tetra
          </span>
        )}
        {ready && (
          <span className="flex items-center gap-1.5 rounded-full border-[1.5px] border-ink bg-mint-soft px-3 py-1 text-xs font-bold text-ink">
            <span className="size-2 rounded-full bg-green" />
            {t.readyPill}
          </span>
        )}
      </div>
      {event?.tagline && (
        <p
          style={{ "--d": "60ms" } as CSSProperties}
          className="animate-rise mt-6 w-fit rounded-full border-[1.5px] border-current px-3 py-0.5 text-xs font-bold"
        >
          {event.tagline}
        </p>
      )}
      <h1
        style={{ "--d": "100ms" } as CSSProperties}
        className={`animate-rise text-[34px] leading-[0.98] font-extrabold tracking-[-0.045em] text-balance ${event?.tagline ? "mt-2.5" : "mt-6"}`}
      >
        {event?.name ?? "Tetra Photobooth"}
      </h1>
      {event && (
        <p
          style={{ "--d": "140ms" } as CSSProperties}
          className={`animate-rise mt-2 font-mono text-xs ${bg ? "opacity-75" : "text-text-2"}`}
        >
          {longDate(event.date)}
        </p>
      )}
    </header>
  );
}

/** Penutup halaman (#217): siapa yang membuat foto ini, tanpa terasa iklan. */
function BrandFooter() {
  return (
    <footer className="mt-auto flex flex-col items-center gap-2 border-t-[1.5px] border-dashed border-ink px-5 pt-6 pb-10 text-center">
      <span className="flex items-center gap-2 text-[15px] font-extrabold tracking-[-0.02em]">
        <span className="flex size-7 items-center justify-center rounded-[8px] border-[1.5px] border-ink bg-mint text-xs">
          T
        </span>
        Tetra Photobooth
      </span>
      <p className="font-mono text-[11px] text-text-2">{t.brandLine}</p>
      <a href={CONTACT_URL} target="_blank" className="text-xs font-bold" rel="noopener">
        tetraphoto.com
      </a>
    </footer>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col">
      {children}
      <BrandFooter />
    </main>
  );
}

function Step({
  mark,
  bg,
  title,
  body,
  last,
}: {
  mark: ReactNode;
  bg: string;
  title: string;
  body: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-3.5">
      <div className="flex flex-col items-center">
        <span
          className={`flex size-[26px] items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold text-white ${bg}`}
        >
          {mark}
        </span>
        {!last && (
          <span className="min-h-[18px] w-0 flex-1 border-l-[1.5px] border-dashed border-ink" />
        )}
      </div>
      <div className="pb-3.5">
        <div className="text-[13px] font-bold">{title}</div>
        <div className="mt-0.5 text-xs text-text-2">{body}</div>
      </div>
    </div>
  );
}

export default async function GuestPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const [g, promo] = await Promise.all([loadGuest(sessionId), loadPromoForSession(sessionId)]);

  // Lead gate (B4): foto ter-blur di belakang form; URL foto belum dikirim server.
  if ((g.state === "ready" || g.state === "pending") && g.lead?.mode === "gate")
    return (
      <Shell>
        <TrackOpen sessionId={sessionId} />
        <Header event={g.event} />
        <div className="mx-auto mt-4 grid h-[384px] w-[256px] grid-cols-2 gap-1.5 bg-white p-3 opacity-80 blur-[9px]">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="bg-[#d9d5d0]" />
          ))}
        </div>
        <LeadSheet sessionId={sessionId} lead={g.lead} />
      </Shell>
    );

  // Photo Stage (#190, desain C7): rombongan fotografer pelaminan.
  if (g.state === "ready" && g.group)
    return (
      <Shell>
        <TrackOpen sessionId={sessionId} />
        <Header event={g.event} ready />
        <StageGuest
          sessionId={sessionId}
          group={g.group}
          time={clock(g.startedAt)}
          assets={g.assets}
          expiresAt={g.expiresAt ? shortDate(g.expiresAt) : null}
          galleryHref={g.publicGallery ? `/s/${sessionId}/galeri` : null}
        />
        {promo && <GuestPromo promo={promo} />}
        {g.lead && <LeadSheet sessionId={sessionId} lead={g.lead} />}
      </Shell>
    );

  // Foto rombongan masih dikirim dari laptop stage (C7b): terbuka sendiri lewat AutoRefresh.
  if (g.state === "pending" && g.group) {
    const s = copy.stageGuest;
    const total = Math.max(1, Math.round(g.total / 2));
    const arrived = g.assets.filter((a) => a.kind === "original").length;
    const steps = [
      ["bg-green text-white", "✓", s.stepTaken, clock(g.startedAt), true],
      ["bg-ink text-white", "2", s.stepSending, s.stepOf(arrived, total), true],
      ["bg-white", "3", s.stepReady, "", false],
    ] as const;
    return (
      <Shell>
        <AutoRefresh seconds={5} />
        <TrackOpen sessionId={sessionId} />
        <Header event={g.event} />
        <div className="flex flex-1 flex-col gap-5 px-5 pb-6">
          <div>
            <p className="font-mono text-[13px] text-text-3">{s.meta(clock(g.startedAt), 0)}</p>
            <h2 className="mt-1.5 text-[30px] leading-[1.1] font-extrabold tracking-[-0.03em] text-balance">
              {g.group}
            </h2>
          </div>
          <section className="rounded-[18px] border-[1.5px] border-ink bg-white p-2.5">
            <div
              className="flex aspect-[3/2] flex-col items-center justify-center gap-4 rounded-[10px]"
              style={{
                background:
                  "repeating-linear-gradient(135deg, var(--neutral) 0 18px, rgba(29,29,27,.05) 18px 36px)",
              }}
            >
              <span className="size-11 animate-spin rounded-full border-4 border-ink/15 border-t-ink/40 motion-reduce:animate-none" />
              <span className="text-[17px] font-extrabold tracking-[-0.01em]">{s.sending}</span>
            </div>
          </section>
          <section className="flex flex-col rounded-[18px] border-[1.5px] border-ink bg-white px-4">
            {steps.map(([bg, mark, title, meta, on], i) => (
              <div
                key={title}
                className={`flex items-center gap-3.5 py-3.5 ${i < 2 ? "border-b-[1.5px] border-dashed border-line-soft" : ""}`}
              >
                <span
                  className={`flex size-[26px] flex-none items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold ${bg}`}
                >
                  {mark}
                </span>
                <span
                  className={`flex-1 text-[15px] ${on ? "font-extrabold" : "font-semibold text-text-2"}`}
                >
                  {title}
                </span>
                <span className="font-mono text-xs text-text-2">{meta}</span>
              </div>
            ))}
          </section>
          <p className="rounded-xl border-[1.5px] border-dashed border-ink bg-sky px-3.5 py-3 text-[13px] leading-[1.5]">
            {s.opensItself}
          </p>
          <button
            type="button"
            disabled
            className="mt-auto h-14 rounded-2xl border-[1.5px] border-dashed border-ink text-[17px] font-extrabold text-muted"
          >
            {s.saveAllEmpty}
          </button>
        </div>
      </Shell>
    );
  }

  if (g.state === "ready")
    return (
      <Shell>
        <TrackOpen sessionId={sessionId} />
        <Header event={g.event} ready />
        {g.group && (
          <h2 className="mx-5 mb-4 text-[22px] leading-tight font-extrabold tracking-[-0.02em]">
            {g.group}
          </h2>
        )}
        <GuestReady
          sessionId={sessionId}
          eventName={g.event.name}
          assets={g.assets}
          expiresAt={g.expiresAt ? shortDate(g.expiresAt) : null}
          stage={!!g.group}
        />
        {g.publicGallery && (
          <a
            href={`/s/${sessionId}/galeri`}
            className="pressable layered mx-5 mb-7 flex h-12 items-center justify-between rounded-xl border-[1.5px] border-ink bg-white pr-2 pl-4 text-sm font-bold no-underline [--lb:1.5px] [--lx:4px] [--under:var(--lavender)]"
          >
            {copy.publicGallery.link}
            <span className="flex size-8 items-center justify-center rounded-full border-[1.5px] border-ink bg-lavender">
              →
            </span>
          </a>
        )}
        {promo && <GuestPromo promo={promo} />}
        {g.lead && <LeadSheet sessionId={sessionId} lead={g.lead} />}
      </Shell>
    );

  if (g.state === "unknown" || g.state === "pending") {
    const strip = g.state === "pending" ? g.assets.find((a) => a.kind === "strip_web") : undefined;
    const arrived = g.state === "pending" ? g.assets.length : 0;
    return (
      <Shell>
        <AutoRefresh seconds={g.state === "pending" ? 5 : 15} />
        {g.state === "pending" && <TrackOpen sessionId={sessionId} />}
        <Header event={g.state === "pending" ? g.event : undefined} />
        <div className="flex flex-1 flex-col gap-[22px] px-5 pt-3 pb-6">
          <section className="layered flex flex-col gap-4 rounded-[18px] border-[1.5px] border-ink bg-white p-[18px] [--lb:1.5px] [--lx:5px] [--under:#fff]">
            <div className="flex h-[300px] items-center justify-center rounded-xl border-[1.5px] border-dashed border-ink bg-paper">
              {strip ? (
                <img src={strip.url} alt="" className="max-h-full rounded" />
              ) : (
                <span className="size-11 animate-spin rounded-full border-4 border-[#e4e2dc] border-t-ink" />
              )}
            </div>
            <h2 className="text-xl font-extrabold tracking-[-0.02em]">
              {g.state === "pending" ? t.pendingTitle : t.unknownTitle}
            </h2>
            <p className="text-sm leading-[1.55] text-pretty text-text-2">
              {g.state === "pending" ? t.pendingBody : t.unknownBody}
            </p>
          </section>
          {g.state === "pending" && (
            <div className="flex flex-col">
              <Step
                mark="✓"
                bg="bg-green"
                title={t.stepTaken}
                body={t.stepTakenAt(clock(g.startedAt))}
              />
              {arrived > 0 ? (
                <Step
                  mark="2"
                  bg="bg-ink"
                  title={t.stepSending}
                  body={t.stepSendingPartial(arrived, g.total)}
                />
              ) : (
                <Step mark="2" bg="bg-ink" title={t.stepWaiting} body={t.stepWaitingBody} />
              )}
              <Step mark="" bg="bg-white" title={t.stepHere} body={t.stepHereBody} last />
            </div>
          )}
          <p className="mt-auto rounded-xl border-[1.5px] border-dashed border-ink bg-sky px-3.5 py-3 text-center text-[13px] font-semibold">
            {t.keepLink}
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <Header event={g.event} />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <span className="flex size-20 items-center justify-center rounded-[22px] border-[1.5px] border-dashed border-ink bg-peach text-[34px] font-extrabold">
          !
        </span>
        <h2 className="text-2xl leading-[1.2] font-extrabold tracking-[-0.025em]">{t.goneTitle}</h2>
        <p className="text-sm leading-[1.55] text-pretty text-text-2">
          {g.state === "expired" ? t.expiredBody(shortDate(g.expiredAt)) : t.removedBody}
        </p>
      </div>
      <section className="mx-5 mb-7 flex flex-col gap-3.5 rounded-[18px] border-[1.5px] border-dashed border-ink bg-peach p-[18px]">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border-[1.5px] border-dashed border-ink bg-white text-lg">
            ✦
          </span>
          <p className="text-base font-extrabold">{t.ctaTitle}</p>
        </div>
        <a
          href={CONTACT_URL}
          className="pressable layered flex h-12 items-center justify-between rounded-xl border-[1.5px] border-ink bg-white pr-2 pl-4 text-sm font-bold no-underline [--lb:1.5px] [--lx:4px] [--under:var(--peach)]"
        >
          {t.cta}
          <span className="flex size-8 items-center justify-center rounded-full border-[1.5px] border-ink bg-mint">
            →
          </span>
        </a>
      </section>
    </Shell>
  );
}
