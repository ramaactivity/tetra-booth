import {
  ArrowRight,
  Camera,
  CreditCard,
  LayoutDashboard,
  MessageCircle,
  Printer,
  QrCode,
  WifiOff,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import type { ReactNode } from "react";
import { TetraMark } from "@/components/guest-cam/ui";
import { copy } from "@/lib/copy";

const t = copy.landing;
const BOOKING = "https://booking.tetraphoto.com/";
const WA = "6285213526630";
const wa = (text: string) => `https://wa.me/${WA}?text=${encodeURIComponent(text)}`;

export const metadata: Metadata = {
  title: t.meta.title,
  description: t.meta.description,
  openGraph: {
    title: t.meta.title,
    description: t.meta.description,
    images: ["/landing/strip.jpg"],
  },
};

const FEATURE_ICONS = [WifiOff, Camera, Printer, QrCode, CreditCard, LayoutDashboard];
const PRODUCT_IMG = [
  { src: "/landing/strip.jpg", w: 300, h: 900 },
  { src: "/landing/booth.jpg", w: 685, h: 900 },
  { src: "/landing/polaroid.jpg", w: 600, h: 800 },
];
const TINT = ["bg-butter", "bg-lavender", "bg-mint-soft"];

const cta =
  "layered pressable inline-flex h-14 items-center justify-center gap-2.5 rounded-[14px] border-[1.5px] border-ink px-6 text-[15px] font-extrabold no-underline [--lb:1.5px] [--lx:5px]";

function Kicker({ children }: { children: ReactNode }) {
  return <p className="font-mono text-xs tracking-[0.12em] text-text-2 uppercase">{children}</p>;
}

/**
 * Landing booth.tetraphoto.com (#244): dua pintu, calon klien acara (Photobooth, Photo Stage, Snapbook → booking) dan
 * vendor photobooth (aplikasi Tetra Booth → minta demo). Snapbook & Photo Stage hanya di bagian acara (eksklusif Tetra);
 * yang dijual ke vendor hanya aplikasi booth. Desain v2: tinta + pastel + kartu berlapis.
 */
export default function Home() {
  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-10 border-b-[1.5px] border-ink bg-paper">
        <nav className="mx-auto flex h-16 max-w-[1120px] items-center justify-between gap-4 px-4 md:px-6">
          <a href="/" className="no-underline">
            <TetraMark sub="Photobooth" />
          </a>
          <div className="flex items-center gap-1 md:gap-2">
            <a
              href="#acara"
              className="hidden rounded-lg px-3 py-2 text-sm font-bold no-underline md:block"
            >
              {t.navEvent}
            </a>
            <a
              href="#vendor"
              className="hidden rounded-lg px-3 py-2 text-sm font-bold no-underline md:block"
            >
              {t.navVendor}
            </a>
            <a
              href="/admin"
              className="rounded-lg px-3 py-2 text-sm font-bold text-text-2 no-underline"
            >
              {t.navLogin}
            </a>
            <a
              href={BOOKING}
              className="layered pressable flex h-10 items-center rounded-[11px] border-[1.5px] border-ink bg-butter px-4 text-sm font-extrabold no-underline [--lb:1.5px] [--lx:4px]"
            >
              <span className="sm:hidden">{t.bookShort}</span>
              <span className="hidden sm:inline">{t.book}</span>
            </a>
          </div>
        </nav>
      </header>

      <main>
        {/* Hero: dua pintu */}
        <section className="mx-auto grid max-w-[1120px] items-center gap-12 px-4 pt-12 pb-16 md:grid-cols-[1.1fr_1fr] md:px-6 md:pt-20 md:pb-24">
          <div className="flex flex-col gap-6">
            <Kicker>{t.heroKicker}</Kicker>
            <h1 className="text-[40px] leading-[1.02] font-extrabold tracking-[-0.045em] text-balance md:text-[64px]">
              {t.heroTitle}
            </h1>
            <p className="max-w-[520px] text-base leading-relaxed text-text-3 md:text-lg">
              {t.heroBody}
            </p>
            <div className="mt-2 grid gap-4 sm:grid-cols-2">
              {(
                [
                  [t.pickEvent, "#acara", "bg-butter"],
                  [t.pickVendor, "#vendor", "bg-white"],
                ] as const
              ).map(([p, href, bg]) => (
                <a
                  key={href}
                  href={href}
                  className={`layered pressable flex flex-col gap-2 rounded-[18px] border-[1.5px] border-ink p-5 no-underline [--lb:1.5px] [--lx:6px] ${bg}`}
                >
                  <span className="flex items-center justify-between text-lg font-extrabold tracking-[-0.02em]">
                    {p.title}
                    <ArrowRight size={20} strokeWidth={2.5} />
                  </span>
                  <span className="text-sm leading-snug text-text-3">{p.body}</span>
                </a>
              ))}
            </div>
          </div>
          <div aria-hidden className="relative mx-auto h-[420px] w-full max-w-[460px] md:h-[520px]">
            <Image
              priority
              src="/landing/strip.jpg"
              width={300}
              height={900}
              alt=""
              className="absolute top-0 left-[8%] h-[92%] w-auto -rotate-3 rounded-md border-[1.5px] border-ink bg-white shadow-[8px_8px_0_var(--ink)]"
            />
            <Image
              priority
              src="/landing/majalah.jpg"
              width={600}
              height={900}
              alt=""
              className="absolute top-[6%] right-0 w-[52%] rotate-2 rounded-md border-[1.5px] border-ink shadow-[8px_8px_0_var(--ink)]"
            />
            <Image
              priority
              src="/landing/polaroid.jpg"
              width={600}
              height={800}
              alt=""
              className="absolute right-[10%] bottom-0 w-[44%] -rotate-1 rounded-md border-[1.5px] border-ink shadow-[8px_8px_0_var(--ink)]"
            />
          </div>
        </section>

        {/* B2C: acara */}
        <section id="acara" className="scroll-mt-20 border-t-[1.5px] border-ink bg-white">
          <div className="mx-auto flex max-w-[1120px] flex-col gap-10 px-4 py-16 md:px-6 md:py-20">
            <div className="flex flex-col gap-3">
              <Kicker>{t.eventKicker}</Kicker>
              <h2 className="text-[30px] leading-tight font-extrabold tracking-[-0.035em] md:text-[44px]">
                {t.eventTitle}
              </h2>
            </div>
            <ul className="grid gap-6 md:grid-cols-3">
              {t.products.map((p, i) => (
                <li
                  key={p.name}
                  className="layered flex flex-col overflow-hidden rounded-[20px] border-[1.5px] border-ink bg-paper [--lb:1.5px] [--lx:6px]"
                >
                  <div
                    className={`flex h-[260px] items-center justify-center border-b-[1.5px] border-ink p-5 ${TINT[i]}`}
                  >
                    <Image
                      src={PRODUCT_IMG[i]?.src ?? ""}
                      width={PRODUCT_IMG[i]?.w ?? 600}
                      height={PRODUCT_IMG[i]?.h ?? 800}
                      alt={p.name}
                      className="h-auto max-h-full w-auto max-w-full rounded-sm border-[1.5px] border-ink bg-white"
                    />
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xl font-extrabold tracking-[-0.02em]">{p.name}</h3>
                      <span className="rounded-full border-[1.5px] border-ink bg-white px-2.5 py-0.5 text-[11px] font-bold">
                        {p.tag}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-text-3">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>

            <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-5 rounded-[20px] border-[1.5px] border-ink bg-paper p-6">
                <h3 className="text-xl font-extrabold tracking-[-0.02em]">{t.stepsTitle}</h3>
                <ol className="flex flex-col gap-4">
                  {t.steps.map(([title, body], i) => (
                    <li key={title} className="flex gap-4">
                      <span className="flex size-9 flex-none items-center justify-center rounded-full border-[1.5px] border-ink bg-butter font-mono text-sm font-bold">
                        {i + 1}
                      </span>
                      <span>
                        <span className="block font-bold">{title}</span>
                        <span className="block text-sm text-text-2">{body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex flex-col justify-between gap-6 rounded-[20px] border-[1.5px] border-ink bg-sky p-6">
                <div className="flex flex-col gap-2">
                  <h3 className="text-xl font-extrabold tracking-[-0.02em]">{t.galleryTitle}</h3>
                  <p className="text-sm leading-relaxed text-text-3">{t.galleryBody}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a href={BOOKING} className={`${cta} bg-butter`}>
                    {t.book} <ArrowRight size={18} strokeWidth={2.5} />
                  </a>
                  <a href={wa(t.eventWa)} className={`${cta} bg-white`}>
                    <MessageCircle size={18} strokeWidth={2.5} /> {t.askAdmin}
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* B2B: vendor */}
        <section id="vendor" className="scroll-mt-20 border-t-[1.5px] border-ink bg-mint-soft">
          <div className="mx-auto flex max-w-[1120px] flex-col gap-10 px-4 py-16 md:px-6 md:py-20">
            <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-end">
              <div className="flex flex-col gap-3">
                <Kicker>{t.vendorKicker}</Kicker>
                <h2 className="text-[30px] leading-tight font-extrabold tracking-[-0.035em] text-balance md:text-[44px]">
                  {t.vendorTitle}
                </h2>
              </div>
              <p className="text-sm leading-relaxed text-text-3 md:text-base">{t.vendorBody}</p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {t.features.map(([title, body], i) => {
                const Icon = FEATURE_ICONS[i] ?? Camera;
                return (
                  <li
                    key={title}
                    className="layered flex flex-col gap-3 rounded-[18px] border-[1.5px] border-ink bg-white p-5 [--lb:1.5px] [--lx:5px]"
                  >
                    <span className="flex size-11 items-center justify-center rounded-[12px] border-[1.5px] border-ink bg-paper">
                      <Icon size={22} strokeWidth={2.25} />
                    </span>
                    <span className="text-base font-extrabold tracking-[-0.02em]">{title}</span>
                    <span className="text-sm leading-relaxed text-text-3">{body}</span>
                  </li>
                );
              })}
            </ul>
            <div>
              <a href={wa(t.demoWa)} className={`${cta} bg-butter`}>
                <MessageCircle size={18} strokeWidth={2.5} /> {t.demo}
              </a>
            </div>
          </div>
        </section>

        {/* Tamu yang mencari foto */}
        <section className="border-t-[1.5px] border-ink">
          <div className="mx-auto flex max-w-[1120px] flex-col items-start gap-2 px-4 py-10 md:flex-row md:items-center md:justify-between md:px-6">
            <div>
              <h2 className="text-lg font-extrabold tracking-[-0.02em]">{t.guestTitle}</h2>
              <p className="text-sm text-text-2">{t.guestBody}</p>
            </div>
            <QrCode size={36} strokeWidth={2} className="hidden md:block" />
          </div>
        </section>
      </main>

      <footer className="border-t-[1.5px] border-ink bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-4 py-6 text-sm md:px-6">
          <span className="font-bold">{t.footer}</span>
          <span className="flex flex-wrap gap-5">
            <a
              href="https://www.instagram.com/tetraphotobooth/"
              className="font-mono text-text-2 no-underline"
            >
              {t.ig}
            </a>
            <a href="https://tetraphoto.com" className="font-mono text-text-2 no-underline">
              {t.site}
            </a>
            <a href={wa(t.eventWa)} className="font-mono text-text-2 no-underline">
              WhatsApp
            </a>
          </span>
        </div>
      </footer>
    </div>
  );
}
