"use client";
import { QrCode } from "@tetra/ui";
import { useEffect, useState } from "react";
import type { LiveEvent, LiveStrip } from "@/lib/live";

const POLL_MS = 5000;
const SLIDE_MS = 6000;
const NEW_MS = 60_000;
const W = 1920;
const H = 1080;

/** Panggung 1920×1080 (D1) diskalakan ke layar; strip bergantian, yang baru langsung tampil. */
export function LiveView({
  token,
  event,
  initial,
  galleryUrl,
}: {
  token: string;
  event: LiveEvent;
  initial: LiveStrip[];
  /** Galeri publik aktif → kartu QR "Scan untuk lihat semua foto" (desain D1). */
  galleryUrl: string | null;
}) {
  const [strips, setStrips] = useState(initial);
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    const t = setInterval(async () => {
      const res = await fetch(`/api/live/${token}`, { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const next = (await res.json()) as LiveStrip[];
      setStrips((prev) => {
        if (next[0] && next[0].id !== prev[0]?.id) setI(0); // sesi baru → langsung tampil
        return next;
      });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [token]);
  useEffect(() => {
    const t = setInterval(
      () => setI((n) => (strips.length ? (n + 1) % strips.length : 0)),
      SLIDE_MS,
    );
    return () => clearInterval(t);
  }, [strips.length]);

  const cur = strips[i];
  const age = cur ? Date.now() - new Date(cur.at).getTime() : -1;
  const fresh = age >= 0 && age < NEW_MS;
  const date = new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${event.date}T00:00:00Z`))
    .replaceAll("/", ".");
  const under = ["var(--peach)", "var(--sky)", "var(--lavender)", "var(--mint-soft)"];

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-paper">
      <div
        style={{ width: W, height: H, transform: `scale(${scale})` }}
        className="relative grid flex-none origin-center grid-cols-[1fr_480px] overflow-hidden bg-paper"
      >
        <div className="relative flex items-center justify-center overflow-hidden">
          <div className="absolute -bottom-60 -left-50 size-[760px] rounded-full bg-mint-soft" />
          <div className="absolute -bottom-35 -left-25 size-[560px] rounded-full border-2 border-white" />
          <div className="absolute -top-35 right-30 size-[360px] rounded-full bg-peach" />
          <div className="absolute top-16 left-20 flex flex-col gap-4">
            {event.tagline && (
              <span className="self-start rounded-full border-[2.5px] border-ink bg-lavender px-5 py-2 text-[22px] font-bold whitespace-nowrap">
                {event.tagline}
              </span>
            )}
            <h1 className="max-w-[640px] text-[84px] leading-[0.95] font-extrabold tracking-[-0.05em]">
              {event.name}
            </h1>
            <span className="font-mono text-2xl text-text-2">{date}</span>
          </div>
          {cur ? (
            <div className="relative ml-[260px] h-[810px]">
              {fresh && (
                <div className="absolute -top-[30px] -right-10 z-10 rotate-6 rounded-full border-[3px] border-ink bg-butter px-7 py-3 text-[32px] font-extrabold whitespace-nowrap">
                  Baru!
                </div>
              )}
              <img
                key={cur.id}
                src={cur.url}
                alt=""
                data-testid="live-main"
                className="layered h-full rounded-xl border-[3px] border-ink bg-white [--lb:3px] [--lx:16px] [--under:#fff]"
              />
            </div>
          ) : (
            <p className="ml-[260px] text-3xl font-bold text-text-2">Foto pertama sebentar lagi…</p>
          )}
        </div>
        <aside className="flex flex-col gap-6 border-l-[2.5px] border-ink bg-white px-11 py-[52px]">
          <div className="flex items-center justify-between">
            <span className="text-[26px] font-extrabold tracking-[-0.02em]">Terbaru</span>
            <span className="flex items-center gap-2 text-lg font-bold">
              <span className="size-3 rounded-full border-[1.5px] border-ink bg-green" />
              Live
            </span>
          </div>
          <div className="grid grid-cols-2 gap-[22px]">
            {strips.slice(0, 4).map((s, n) => (
              <img
                key={s.id}
                src={s.url}
                alt=""
                style={{ ["--under" as string]: under[n] }}
                className="layered aspect-[2/3] w-full rounded-lg border-2 border-ink bg-white object-contain p-2 [--lb:2px] [--lx:6px]"
              />
            ))}
          </div>
          {galleryUrl && (
            <div className="mt-auto flex items-center gap-[22px] rounded-3xl border-[2.5px] border-ink bg-sky p-[22px]">
              <div className="flex-none rounded-[14px] border-2 border-ink bg-white p-2">
                <QrCode url={galleryUrl} size={130} />
              </div>
              <p className="text-[26px] leading-[1.2] font-extrabold tracking-[-0.02em]">
                Scan untuk lihat semua foto
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
