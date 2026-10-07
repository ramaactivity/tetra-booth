"use client";
import { filterCss, type GuestMe, PHOTO_FILTERS } from "@tetra/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { capture } from "./capture";
import { enqueue, flush, itemId, queued } from "./queue";

const t = copy.guestCam;
const btn =
  "flex h-12 items-center justify-center rounded-[12px] border-[1.5px] border-ink px-5 text-[15px] font-bold disabled:opacity-50";

type Phase = "join" | "camera" | "mine";
type Cam = "idle" | "on" | "denied";

/** idx foto berikutnya yang belum dipakai (server + antrean lokal), atau null kalau jatah habis. */
const nextIdx = (shots: number, taken: Set<number>) => {
  for (let i = 0; i < shots; i++) if (!taken.has(i)) return i;
  return null;
};

export function GuestCam({
  token,
  info,
  initialMe,
}: {
  token: string;
  info: GuestInfo;
  initialMe: GuestMe | null;
}) {
  const [me, setMe] = useState(initialMe);
  const [phase, setPhase] = useState<Phase>(initialMe ? "camera" : "join");
  const [pendingIdx, setPendingIdx] = useState<number[]>([]);
  const refreshQueue = useCallback(
    async () =>
      setPendingIdx((await queued(token)).filter((i) => i.kind === "photo").map((i) => i.idx)),
    [token],
  );
  const sync = useCallback(async () => {
    await flush(token, setMe);
    await refreshQueue();
  }, [token, refreshQueue]);

  // Kirim antrean saat halaman dibuka, saat online lagi, dan tiap 15 detik selama masih ada yang antre.
  useEffect(() => {
    if (!me) return;
    void sync();
    const on = () => void sync();
    window.addEventListener("online", on);
    const timer = setInterval(on, 15_000);
    return () => {
      window.removeEventListener("online", on);
      clearInterval(timer);
    };
  }, [me, sync]);

  const taken = new Set([...(me?.usedIdx ?? []), ...pendingIdx]);
  const left = Math.max(0, info.shots - taken.size);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-paper">
      <header
        className="flex items-center justify-between gap-3 border-b-[1.5px] border-ink px-5 pt-6 pb-4"
        style={info.branding.color ? { background: info.branding.color } : undefined}
      >
        <div>
          <h1 className="text-[15px] font-extrabold">{info.name}</h1>
          <p className="font-mono text-[11px] opacity-75">{me ? me.name : info.date}</p>
        </div>
        {info.branding.logoUrl ? (
          // biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan, bukan aset Next
          <img src={info.branding.logoUrl} alt="" className="h-10 max-w-[120px] object-contain" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-[9px] border-[1.5px] border-ink bg-mint text-sm font-extrabold">
            T
          </span>
        )}
      </header>
      {phase === "join" || !me ? (
        <Join
          token={token}
          info={info}
          onJoined={(m) => {
            setMe(m);
            setPhase("camera");
          }}
        />
      ) : phase === "camera" ? (
        <Camera
          info={info}
          left={left}
          pending={pendingIdx.length}
          onShot={async (shot) => {
            const idx = nextIdx(info.shots, taken);
            if (idx === null) return;
            await enqueue({ id: itemId(token, "photo", idx), token, kind: "photo", idx, ...shot });
            await refreshQueue();
            void sync();
          }}
          onMine={() => setPhase("mine")}
        />
      ) : (
        <Mine me={me} pending={pendingIdx.length} onCamera={() => setPhase("camera")} />
      )}
    </main>
  );
}

function Join({
  token,
  info,
  onJoined,
}: {
  token: string;
  info: GuestInfo;
  onJoined: (me: GuestMe) => void;
}) {
  const [via, setVia] = useState<"whatsapp" | "instagram">("whatsapp");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-1 flex-col gap-4 p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (f.get("consent") !== "on") return setError(t.invalid);
        setBusy(true);
        setError(null);
        const r = await fetch(`/api/c/${encodeURIComponent(token)}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: f.get("name"), [via]: f.get("contact"), consent: true }),
        }).catch(() => null);
        setBusy(false);
        if (r?.ok) return onJoined((await r.json()) as GuestMe);
        setError(r?.status === 400 ? t.invalid : t.failed);
      }}
    >
      <div>
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">{t.invite(info.name)}</h2>
        <p className="mt-2 text-sm text-text-2">
          {t.quota(info.shots)} {info.reveal === "live" ? t.revealLive : t.revealAfter}
        </p>
      </div>
      <label className="flex flex-col gap-1.5 text-sm font-bold">
        {t.name}
        <input
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          placeholder={t.namePh}
          className="h-12 rounded-[12px] border-[1.5px] border-ink bg-white px-4 text-base font-medium"
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-2 overflow-hidden rounded-[12px] border-[1.5px] border-ink">
          {(["whatsapp", "instagram"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={via === v}
              onClick={() => setVia(v)}
              className={`h-11 text-sm font-bold ${via === v ? "bg-mint" : "bg-white"}`}
            >
              {v === "whatsapp" ? t.contactWa : t.contactIg}
            </button>
          ))}
        </div>
        <input
          key={via}
          name="contact"
          required
          aria-label={via === "whatsapp" ? t.contactWa : t.contactIg}
          type={via === "whatsapp" ? "tel" : "text"}
          inputMode={via === "whatsapp" ? "tel" : "text"}
          autoCapitalize="none"
          placeholder={via === "whatsapp" ? t.waPh : t.igPh}
          className="h-12 rounded-[12px] border-[1.5px] border-ink bg-white px-4 text-base font-medium"
        />
      </div>
      <label className="flex items-start gap-3 text-[13px] leading-snug text-text-2">
        <input name="consent" type="checkbox" className="mt-0.5 size-5 accent-ink" />
        <span>
          <b className="text-ink">{t.consent}.</b> {info.consentText}
        </span>
      </label>
      {error && <p className="text-sm font-bold text-coral-strong">{error}</p>}
      <button type="submit" disabled={busy} className={`${btn} mt-auto bg-butter`}>
        {busy ? t.joining : t.start}
      </button>
    </form>
  );
}

const inApp = () => /Instagram|FBAN|FBAV|Line\//.test(navigator.userAgent);

function Camera({
  info,
  left,
  pending,
  onShot,
  onMine,
}: {
  info: GuestInfo;
  left: number;
  pending: number;
  onShot: (shot: { main: Blob; thumb: Blob }) => Promise<void>;
  onMine: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [cam, setCam] = useState<Cam>("idle");
  const [facing, setFacing] = useState<"user" | "environment">("environment");
  const [filter, setFilter] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(false);

  const start = useCallback(async (face: "user" | "environment") => {
    for (const tr of stream.current?.getTracks() ?? []) tr.stop();
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: face, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
      stream.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
      }
      setCam("on");
    } catch {
      setCam("denied");
    }
  }, []);
  useEffect(
    () => () => {
      for (const tr of stream.current?.getTracks() ?? []) tr.stop();
    },
    [],
  );

  if (left === 0)
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <h2 className="text-2xl font-extrabold">{t.done}</h2>
        <p className="text-sm text-text-2">{t.doneBody}</p>
        <Status pending={pending} />
        <button type="button" onClick={onMine} className={`${btn} bg-butter`}>
          {t.mine}
        </button>
      </section>
    );

  return (
    <section className="flex flex-1 flex-col">
      <div className="relative flex-1 overflow-hidden bg-ink">
        <video
          ref={video}
          playsInline
          muted
          className="absolute inset-0 size-full object-cover"
          style={{
            filter: filterCss(filter),
            transform: facing === "user" ? "scaleX(-1)" : undefined,
          }}
        />
        {flash && <div className="absolute inset-0 bg-white" />}
        {cam !== "on" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-paper p-8 text-center">
            {cam === "idle" ? (
              <>
                <h2 className="text-xl font-extrabold">{t.camAsk}</h2>
                <p className="text-sm text-text-2">{t.camAskBody}</p>
                <button
                  type="button"
                  onClick={() => void start(facing)}
                  className={`${btn} bg-butter`}
                >
                  {t.camAllow}
                </button>
              </>
            ) : inApp() ? (
              <>
                <h2 className="text-xl font-extrabold">{t.inApp}</h2>
                <p className="text-sm text-text-2">{t.inAppBody}</p>
                <CopyLink />
              </>
            ) : (
              <>
                <h2 className="text-xl font-extrabold">{t.camDenied}</h2>
                <p className="text-sm text-text-2">{t.camDeniedBody}</p>
              </>
            )}
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full border-[1.5px] border-ink bg-butter px-3 py-1 font-mono text-sm font-bold">
          {t.left(left)}
        </span>
      </div>
      {info.filters.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-3">
          {info.filters.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`shrink-0 rounded-full border-[1.5px] border-ink px-3.5 py-1.5 text-[13px] font-bold ${filter === id ? "bg-mint" : "bg-white"}`}
            >
              {PHOTO_FILTERS.find((f) => f.id === id)?.label ?? id}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 items-center gap-3 px-5 pt-1 pb-6">
        <button type="button" onClick={onMine} className="text-left text-sm font-bold underline">
          {t.mine}
          <Status pending={pending} />
        </button>
        <button
          type="button"
          aria-label={t.shutter}
          disabled={cam !== "on" || busy}
          onClick={async () => {
            const v = video.current;
            if (!v) return;
            setBusy(true);
            setFlash(true);
            setTimeout(() => setFlash(false), 120);
            try {
              await onShot(await capture(v, filter));
            } finally {
              setBusy(false);
            }
          }}
          className="mx-auto size-[76px] rounded-full border-[3px] border-ink bg-butter disabled:opacity-50"
        />
        <button
          type="button"
          disabled={cam !== "on"}
          onClick={() => {
            const f = facing === "user" ? "environment" : "user";
            setFacing(f);
            void start(f);
          }}
          className="ml-auto text-sm font-bold underline disabled:opacity-50"
        >
          {t.flip}
        </button>
      </div>
    </section>
  );
}

function Status({ pending }: { pending: number }) {
  return (
    <span className="block font-mono text-[11px] font-normal text-text-2 no-underline">
      {pending ? (navigator.onLine ? t.uploading(pending) : t.pending(pending)) : t.allSent}
    </span>
  );
}

function CopyLink() {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => void navigator.clipboard?.writeText(location.href).then(() => setDone(true))}
      className={`${btn} bg-butter`}
    >
      {done ? t.copied : t.copyLink}
    </button>
  );
}

function Mine({ me, pending, onCamera }: { me: GuestMe; pending: number; onCamera: () => void }) {
  const count = me.usedIdx.length + pending;
  return (
    <section className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-extrabold">{t.mine}</h2>
        <Status pending={pending} />
      </div>
      {!me.revealed ? (
        <div className="rounded-[16px] border-[1.5px] border-ink bg-lavender p-5">
          <p className="font-bold">{t.locked}</p>
          <p className="mt-1 text-sm">{t.lockedBody(count)}</p>
        </div>
      ) : me.photos.length === 0 ? (
        <p className="text-sm text-text-2">{t.empty}</p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {me.photos.map((p) => (
            <li
              key={p.idx}
              className="relative overflow-hidden rounded-[10px] border-[1.5px] border-ink"
            >
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan, bukan aset Next */}
                <img
                  src={p.thumbUrl ?? p.url}
                  alt=""
                  className="aspect-[3/4] w-full object-cover"
                />
              </a>
              {p.waiting && (
                <span className="absolute inset-x-1 bottom-1 rounded-full border border-ink bg-peach px-1.5 py-0.5 text-center text-[10px] font-bold">
                  {t.waiting}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={onCamera} className={`${btn} mt-auto bg-butter`}>
        {t.camera}
      </button>
    </section>
  );
}
