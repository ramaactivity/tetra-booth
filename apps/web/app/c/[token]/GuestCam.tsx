"use client";
import {
  filterCss,
  GUEST_MAX_STRIPS,
  GUEST_VOICE_MAX_SEC,
  type GuestMe,
  PHOTO_FILTERS,
} from "@tetra/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { copy } from "@/lib/copy";
import type { GuestInfo } from "@/lib/guest-cam";
import { capture } from "./capture";
import { enqueue, flush, itemId, type QueueItem, queued } from "./queue";
import { renderStrip } from "./strip";

const t = copy.guestCam;
const btn =
  "flex h-12 items-center justify-center rounded-[12px] border-[1.5px] border-ink px-5 text-[15px] font-bold disabled:opacity-50";

type Phase = "join" | "camera" | "mine" | "voice" | "strip";
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
  const [q, setQ] = useState<QueueItem[]>([]);
  const refreshQueue = useCallback(async () => setQ(await queued(token)), [token]);
  const pendingIdx = q.filter((i) => i.kind === "photo").map((i) => i.idx);
  const add = async (item: Omit<QueueItem, "id" | "token">) => {
    await enqueue({ ...item, id: itemId(token, item.kind, item.idx), token });
    await refreshQueue();
    void sync();
  };
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
            if (idx !== null) await add({ kind: "photo", idx, ...shot });
          }}
          onMine={() => setPhase("mine")}
        />
      ) : phase === "voice" ? (
        <Voice
          onBack={() => setPhase("mine")}
          onSend={async (blob, audioType) => {
            await add({ kind: "audio", idx: 0, main: blob, audioType });
            setPhase("mine");
          }}
        />
      ) : phase === "strip" && info.design ? (
        <StripMaker
          info={info}
          me={me}
          onBack={() => setPhase("mine")}
          onSend={async (shot) => {
            const idx = me.stripCount + q.filter((i) => i.kind === "strip").length;
            if (idx < GUEST_MAX_STRIPS) await add({ kind: "strip", idx, ...shot });
            setPhase("mine");
          }}
        />
      ) : (
        <Mine
          me={me}
          pending={pendingIdx.length}
          voice={info.voice && !me.audio && !q.some((i) => i.kind === "audio")}
          strip={
            !!info.design &&
            me.revealed &&
            me.photos.length >= (info.design?.layout.slots.length ?? 1) &&
            me.stripCount + q.filter((i) => i.kind === "strip").length < GUEST_MAX_STRIPS
          }
          voiceSent={me.audio || q.some((i) => i.kind === "audio")}
          onCamera={() => setPhase("camera")}
          onVoice={() => setPhase("voice")}
          onStrip={() => setPhase("strip")}
        />
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

const Thumb = ({ item }: { item: GuestMe["photos"][number] }) => (
  <li className="relative overflow-hidden rounded-[10px] border-[1.5px] border-ink">
    <a href={item.url} target="_blank" rel="noreferrer">
      {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan, bukan aset Next */}
      <img src={item.thumbUrl ?? item.url} alt="" className="aspect-[3/4] w-full object-cover" />
    </a>
    {item.waiting && (
      <span className="absolute inset-x-1 bottom-1 rounded-full border border-ink bg-peach px-1.5 py-0.5 text-center text-[10px] font-bold">
        {t.waiting}
      </span>
    )}
  </li>
);

function Mine({
  me,
  pending,
  voice,
  voiceSent,
  strip,
  onCamera,
  onVoice,
  onStrip,
}: {
  me: GuestMe;
  pending: number;
  voice: boolean;
  voiceSent: boolean;
  strip: boolean;
  onCamera: () => void;
  onVoice: () => void;
  onStrip: () => void;
}) {
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
            <Thumb key={p.idx} item={p} />
          ))}
        </ul>
      )}
      {me.strips.length > 0 && (
        <>
          <h3 className="font-extrabold">{t.stripsMine}</h3>
          <ul className="grid grid-cols-3 gap-2">
            {me.strips.map((p) => (
              <Thumb key={p.idx} item={p} />
            ))}
          </ul>
        </>
      )}
      {voiceSent && <p className="text-sm font-bold">{t.voiceSent}</p>}
      <div className="mt-auto flex flex-col gap-2">
        {(voice || strip) && (
          <div className="grid grid-cols-2 gap-2">
            {voice && (
              <button type="button" onClick={onVoice} className={`${btn} bg-sky`}>
                {t.voice}
              </button>
            )}
            {strip && (
              <button type="button" onClick={onStrip} className={`${btn} bg-lavender`}>
                {t.strip}
              </button>
            )}
          </div>
        )}
        <button type="button" onClick={onCamera} className={`${btn} bg-butter`}>
          {t.camera}
        </button>
      </div>
    </section>
  );
}

function Voice({
  onBack,
  onSend,
}: {
  onBack: () => void;
  onSend: (blob: Blob, type: "audio/webm" | "audio/mp4") => Promise<void>;
}) {
  const rec = useRef<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [take, setTake] = useState<{ blob: Blob; url: string; type: "audio/webm" | "audio/mp4" }>();
  const [error, setError] = useState(false);
  const recording = !!rec.current && rec.current.state === "recording";

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(
      () =>
        setSecs((s) => {
          if (s + 1 >= GUEST_VOICE_MAX_SEC) rec.current?.stop();
          return s + 1;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [recording]);

  const start = async () => {
    setError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const mr = new MediaRecorder(
        stream,
        MediaRecorder.isTypeSupported(mime) ? { mimeType: mime } : {},
      );
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = () => {
        for (const tr of stream.getTracks()) tr.stop();
        const type = mr.mimeType.startsWith("audio/mp4") ? "audio/mp4" : "audio/webm";
        const blob = new Blob(chunks, { type });
        setTake({ blob, url: URL.createObjectURL(blob), type });
        rec.current = null;
        setSecs(0);
      };
      rec.current = mr;
      mr.start();
      setSecs(0);
      setTake(undefined);
    } catch {
      setError(true);
    }
  };

  return (
    <section className="flex flex-1 flex-col gap-4 p-5">
      <h2 className="text-xl font-extrabold">{t.voiceTitle}</h2>
      <p className="text-sm text-text-2">{t.voiceBody(GUEST_VOICE_MAX_SEC)}</p>
      <p className="text-center font-mono text-5xl font-bold" aria-live="polite">
        0:{String(recording ? secs : 0).padStart(2, "0")}
      </p>
      {take && (
        // biome-ignore lint/a11y/useMediaCaption: rekaman ucapan tamu sendiri, tanpa teks
        <audio controls src={take.url} className="w-full" />
      )}
      {error && <p className="text-sm font-bold text-coral-strong">{t.micDenied}</p>}
      <div className="mt-auto flex flex-col gap-2">
        {recording ? (
          <button type="button" onClick={() => rec.current?.stop()} className={`${btn} bg-coral`}>
            {t.stop}
          </button>
        ) : take ? (
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void start()} className={`${btn} bg-white`}>
              {t.again}
            </button>
            <button
              type="button"
              onClick={() => void onSend(take.blob, take.type)}
              className={`${btn} bg-butter`}
            >
              {t.send}
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => void start()} className={`${btn} bg-butter`}>
            {t.record}
          </button>
        )}
        <button type="button" onClick={onBack} className="text-sm font-bold underline">
          {t.back}
        </button>
      </div>
    </section>
  );
}

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${iso}T12:00:00`),
  );

function StripMaker({
  info,
  me,
  onBack,
  onSend,
}: {
  info: GuestInfo;
  me: GuestMe;
  onBack: () => void;
  onSend: (shot: { main: Blob; thumb: Blob }) => Promise<void>;
}) {
  const design = info.design;
  const n = design?.layout.slots.length ?? 0;
  const [picked, setPicked] = useState<number[]>([]);
  const [made, setMade] = useState<{ main: Blob; thumb: Blob; url: string }>();
  const [busy, setBusy] = useState(false);
  if (!design) return null;
  const toggle = (idx: number) =>
    setPicked((p) =>
      p.includes(idx) ? p.filter((x) => x !== idx) : p.length < n ? [...p, idx] : p,
    );

  return (
    <section className="flex flex-1 flex-col gap-4 p-5">
      <h2 className="text-xl font-extrabold">{t.stripTitle(n)}</h2>
      {made ? (
        // biome-ignore lint/performance/noImgElement: object URL hasil render lokal
        <img
          src={made.url}
          alt={t.strip}
          className="mx-auto max-h-[60dvh] border-[1.5px] border-ink"
        />
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {me.photos.map((p) => {
            const at = picked.indexOf(p.idx);
            return (
              <li key={p.idx}>
                <button
                  type="button"
                  aria-pressed={at >= 0}
                  onClick={() => toggle(p.idx)}
                  className={`relative block w-full overflow-hidden rounded-[10px] border-[1.5px] border-ink ${at >= 0 ? "ring-4 ring-mint" : ""}`}
                >
                  {/* biome-ignore lint/performance/noImgElement: URL R2 bertanda tangan */}
                  <img
                    src={p.thumbUrl ?? p.url}
                    alt=""
                    className="aspect-[3/4] w-full object-cover"
                  />
                  {at >= 0 && (
                    <span className="absolute top-1 left-1 flex size-6 items-center justify-center rounded-full border border-ink bg-mint font-mono text-xs font-bold">
                      {at + 1}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-auto flex flex-col gap-2">
        {made ? (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSend(made);
            }}
            className={`${btn} bg-butter`}
          >
            {t.stripSend}
          </button>
        ) : (
          <button
            type="button"
            disabled={picked.length !== n || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const urls = picked.map((i) => me.photos.find((p) => p.idx === i)?.url ?? "");
                const r = await renderStrip(
                  design,
                  urls,
                  { event_name: info.name, date: longDate(info.date) },
                  location.origin + info.link,
                );
                setMade({ ...r, url: URL.createObjectURL(r.main) });
              } finally {
                setBusy(false);
              }
            }}
            className={`${btn} bg-butter`}
          >
            {busy ? t.stripMaking : t.stripMake}
          </button>
        )}
        <button type="button" onClick={onBack} className="text-sm font-bold underline">
          {t.back}
        </button>
      </div>
    </section>
  );
}
