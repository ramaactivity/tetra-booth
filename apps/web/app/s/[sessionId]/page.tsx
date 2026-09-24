import type { Metadata } from "next";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { clock, type GuestEvent, loadGuest, longDate, shortDate } from "@/lib/guest";
import { AutoRefresh } from "./AutoRefresh";
import { GuestReady } from "./GuestReady";

/** Halaman tamu dari QR booth (FSD §2, desain v2 B1–B3). Mobile-first 390 px. */
export const metadata: Metadata = {
  title: "Foto kamu · Tetra Photobooth",
  robots: { index: false, follow: false },
};

const t = copy.guest;
const CONTACT_URL = "https://tetraphoto.com";

function Header({ event }: { event?: GuestEvent | undefined }) {
  return (
    <header className="flex items-center justify-between px-5 pt-8 pb-4">
      <div>
        <h1 className="text-[15px] font-extrabold tracking-[-0.01em]">
          {event?.name ?? "Tetra Photobooth"}
        </h1>
        {event && (
          <p className="mt-0.5 font-mono text-[11px] text-text-2">{longDate(event.date)}</p>
        )}
      </div>
      <span className="flex size-8 items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-mint text-sm font-extrabold">
        T
      </span>
    </header>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col">{children}</main>;
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
  const g = await loadGuest(sessionId);

  if (g.state === "ready")
    return (
      <Shell>
        <Header event={g.event} />
        <GuestReady
          sessionId={sessionId}
          assets={g.assets}
          expiresAt={g.expiresAt ? shortDate(g.expiresAt) : null}
        />
      </Shell>
    );

  if (g.state === "unknown" || g.state === "pending") {
    const strip = g.state === "pending" ? g.assets.find((a) => a.kind === "strip_web") : undefined;
    const arrived = g.state === "pending" ? g.assets.length : 0;
    return (
      <Shell>
        <AutoRefresh seconds={g.state === "pending" ? 5 : 15} />
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
