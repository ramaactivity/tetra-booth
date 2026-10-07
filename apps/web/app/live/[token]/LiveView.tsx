"use client";
import { QrCode } from "@tetra/ui";
import { useEffect, useState } from "react";
import type { LiveEvent, LiveStrip } from "@/lib/live";

const POLL_MS = 5000;
const SLIDE_MS = 6000;
const NEW_MS = 60_000;
/** Kartu ajakan Guest Cam (C12b, #203): tiap 6 slide, tampil 12 detik. */
const INVITE_EVERY = 6;
const INVITE_MS = 12_000;
const W = 1920;
const H = 1080;

/** Panggung 1920×1080 (D1) diskalakan ke layar; strip bergantian, yang baru langsung tampil. */
export function LiveView({
  token,
  event,
  initial,
  galleryUrl,
  guestUrl,
}: {
  token: string;
  event: LiveEvent;
  initial: LiveStrip[];
  /** Galeri publik aktif → kartu QR "Scan untuk lihat semua foto" (desain D1). */
  galleryUrl: string | null;
  /** Guest Cam aktif → kartu ajakan berkala. */
  guestUrl: string | null;
}) {
  const [strips, setStrips] = useState(initial);
  const [i, setI] = useState(0);
  const [scale, setScale] = useState(1);
  const [, setSlides] = useState(0);
  const [invite, setInvite] = useState(false);

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
    if (invite) {
      const t = setTimeout(() => setInvite(false), INVITE_MS);
      return () => clearTimeout(t);
    }
    const t = setInterval(() => {
      setI((n) => (strips.length ? (n + 1) % strips.length : 0));
      setSlides((k) => {
        if (guestUrl && (k + 1) % INVITE_EVERY === 0) setInvite(true);
        return k + 1;
      });
    }, SLIDE_MS);
    return () => clearInterval(t);
  }, [strips.length, invite, guestUrl]);

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

  if (invite && guestUrl)
    return (
      <div className="fixed inset-0 flex items-center justify-center overflow-hidden bg-paper">
        <div
          style={{ width: W, height: H, transform: `scale(${scale})` }}
          className="relative flex flex-none origin-center items-center gap-24 overflow-hidden bg-paper px-28"
          data-testid="live-invite"
        >
          <div className="absolute -right-40 -bottom-60 size-[640px] rounded-full bg-peach" />
          <div className="relative flex flex-1 flex-col gap-8">
            <span className="self-start rounded-full border-[2.5px] border-ink bg-lavender px-5 py-2 text-[22px] font-bold">
              {event.name} · Kamera Tamu
            </span>
            <h1 className="text-[150px] leading-[0.9] font-extrabold tracking-[-0.06em]">
              Ikut isi album!
            </h1>
            <p className="max-w-[760px] text-[32px] leading-snug">
              Scan QR ini, isi nama, lalu jepret dari HP-mu. Tanpa install aplikasi.
            </p>
            <div className="mt-6 flex gap-4 text-[26px] font-bold">
              {["01 Scan", "02 Isi nama", "03 Jepret"].map((s, n) => (
                <span
                  key={s}
                  className={`rounded-[16px] border-[2.5px] border-ink px-6 py-3 ${n === 2 ? "bg-butter" : "bg-white"}`}
                >
                  <span className="font-mono">{s.slice(0, 2)}</span> {s.slice(3)}
                </span>
              ))}
            </div>
          </div>
          <div className="relative flex flex-col items-center gap-6">
            <div className="layered rounded-[36px] border-[3px] border-ink bg-sky p-10 [--lb:3px] [--lx:16px]">
              <div className="rounded-[24px] border-[3px] border-ink bg-white p-6">
                <QrCode url={guestUrl} size={420} />
              </div>
              <p className="mt-5 max-w-[480px] font-mono text-xl break-all">
                {guestUrl.replace(/^https?:\/\//, "")}
              </p>
            </div>
            {event.guest && event.guest.photos > 0 && (
              <span className="font-mono text-xl">
                {event.guest.photos.toLocaleString("id-ID")} foto dari{" "}
                {event.guest.guests.toLocaleString("id-ID")} tamu
              </span>
            )}
          </div>
        </div>
      </div>
    );

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
              {cur.by ? (
                // Foto Guest Cam (C12a): bingkai polaroid miring + label Kamera Tamu + "oleh {nama}".
                <div className="layered flex h-full -rotate-2 flex-col rounded-xl border-[3px] border-ink bg-white px-7 pt-7 pb-24 [--lb:3px] [--lx:16px] [--under:#fff]">
                  <img
                    key={cur.id}
                    src={cur.url}
                    alt=""
                    data-testid="live-main"
                    className="min-h-0 flex-1 rounded-md object-cover"
                  />
                  <div className="absolute right-7 bottom-7 left-7 flex items-center justify-between">
                    <span className="flex items-center gap-3 rounded-full border-[3px] border-ink bg-white py-1.5 pr-6 pl-2 text-[28px] font-extrabold">
                      <span className="flex size-10 items-center justify-center rounded-full border-[2px] border-ink bg-peach text-lg">
                        {cur.by.replace(/^@/, "").slice(0, 1).toUpperCase()}
                      </span>
                      oleh {cur.by}
                    </span>
                    <span className="font-mono text-xl">
                      {new Intl.DateTimeFormat("id-ID", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Jakarta",
                      }).format(new Date(cur.at))}
                    </span>
                  </div>
                  <span className="absolute -top-6 -right-8 rotate-6 rounded-[12px] border-[3px] border-ink bg-butter px-6 py-2 text-[28px] font-extrabold">
                    Kamera Tamu
                  </span>
                </div>
              ) : (
                <img
                  key={cur.id}
                  src={cur.url}
                  alt=""
                  data-testid="live-main"
                  className="layered h-full rounded-xl border-[3px] border-ink bg-white [--lb:3px] [--lx:16px] [--under:#fff]"
                />
              )}
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
              <figure key={s.id} className="flex flex-col gap-2">
                <img
                  src={s.url}
                  alt=""
                  style={{ ["--under" as string]: under[n] }}
                  className="layered aspect-[2/3] w-full rounded-lg border-2 border-ink bg-white object-contain p-2 [--lb:2px] [--lx:6px]"
                />
                {guestUrl && (
                  <figcaption className="truncate text-base font-bold">
                    {s.by ? `oleh ${s.by}` : "Photobooth"}
                  </figcaption>
                )}
              </figure>
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
