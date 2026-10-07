"use client";
import { GUEST_MAX_STRIPS, type GuestMe } from "@tetra/shared";
import { useCallback, useEffect, useState } from "react";
import { Done, Mine } from "@/components/guest-cam/After";
import { Camera } from "@/components/guest-cam/Camera";
import { Join } from "@/components/guest-cam/Join";
import { StripPicker } from "@/components/guest-cam/StripPicker";
import { goFullscreen } from "@/components/guest-cam/ui";
import { VoiceRecorder } from "@/components/guest-cam/VoiceRecorder";
import type { GuestInfo } from "@/lib/guest-cam";
import { capture } from "./capture";
import { enqueue, flush, itemId, type QueueItem, queued } from "./queue";

type Phase = "join" | "cam" | "done" | "mine" | "voice" | "strip";

/** idx foto berikutnya yang belum dipakai (server + antrean lokal), atau null kalau jatah habis. */
const nextIdx = (shots: number, taken: Set<number>) => {
  for (let i = 0; i < shots; i++) if (!taken.has(i)) return i;
  return null;
};

/**
 * Guest Cam (#197, desain G5 · DECISIONS #203): A1 → A2/A3 kamera → A5 jatah habis → A7 foto saya, A8 ucapan,
 * A9 strip. Antrean unggah di IndexedDB dikirim saat dibuka, saat online lagi, dan tiap 15 detik.
 */
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
  const [q, setQ] = useState<QueueItem[]>([]);
  const [failing, setFailing] = useState(false);
  const [online, setOnline] = useState(true);
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(() =>
    !initialMe ? "join" : initialMe.shotsLeft > 0 ? "cam" : "done",
  );

  const refresh = useCallback(async () => setQ(await queued(token)), [token]);
  const sync = useCallback(async () => {
    setOnline(navigator.onLine);
    const ok = await flush(token, setMe);
    await refresh();
    setFailing(!ok && navigator.onLine);
  }, [token, refresh]);

  // Layar penuh tanpa bar browser: ketukan pertama di mana pun (Android; iOS Safari menolak).
  useEffect(() => {
    const once = () => goFullscreen();
    window.addEventListener("pointerdown", once, { once: true });
    return () => window.removeEventListener("pointerdown", once);
  }, []);

  useEffect(() => {
    if (!me) return;
    void sync();
    const on = () => void sync();
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const timer = setInterval(on, 15_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(timer);
    };
  }, [me, sync]);

  const add = async (item: Omit<QueueItem, "id" | "token">) => {
    await enqueue({ ...item, id: itemId(token, item.kind, item.idx), token });
    await refresh();
    void sync();
  };

  if (!me || phase === "join")
    return (
      <Join
        token={token}
        info={info}
        onJoined={(m) => {
          setMe(m);
          setPhase(m.shotsLeft > 0 ? "cam" : "done");
        }}
      />
    );

  const pendingIdx = q.filter((i) => i.kind === "photo").map((i) => i.idx);
  const taken = new Set([...me.usedIdx, ...pendingIdx]);
  // Acara selesai (A10): kamera ditutup, tamu tetap bisa membuka foto, ucapan, strip.
  const left = info.closed ? 0 : Math.max(0, info.shots - taken.size);
  const strips = me.stripCount + q.filter((i) => i.kind === "strip").length;
  const slots = info.design?.layout.slots.length ?? 0;
  const canStrip =
    !!info.design && me.revealed && me.photos.length >= slots && strips < GUEST_MAX_STRIPS;
  const voiceSent = me.audio || q.some((i) => i.kind === "audio");
  const voice = info.voice && !voiceSent;

  if (phase === "voice")
    return (
      <VoiceRecorder
        info={info}
        name={me.name}
        sent={voiceSent}
        onClose={() => setPhase(left > 0 ? "cam" : "mine")}
        onSend={(blob, audioType) => add({ kind: "audio", idx: 0, main: blob, audioType })}
      />
    );
  if (phase === "strip" && canStrip)
    return (
      <StripPicker
        info={info}
        me={me}
        k={strips + 1}
        onClose={() => setPhase("mine")}
        onSend={async (shot) => {
          await add({ kind: "strip", idx: strips, ...shot });
          setPhase("mine");
        }}
      />
    );
  if (phase === "done")
    return (
      <Done
        info={info}
        me={me}
        voice={voice}
        strip={
          !info.strip || !info.design
            ? "off"
            : canStrip
              ? "on"
              : me.revealed && strips < GUEST_MAX_STRIPS
                ? "wait"
                : "locked"
        }
        onVoice={() => setPhase("voice")}
        onStrip={() => setPhase("strip")}
        onMine={() => setPhase("mine")}
      />
    );
  if (phase === "mine" || left <= 0)
    return (
      <Mine
        token={token}
        info={info}
        me={me}
        pending={pendingIdx.length}
        left={left}
        voice={voice}
        strip={canStrip}
        onCamera={() => setPhase(left > 0 ? "cam" : "done")}
        onVoice={() => setPhase("voice")}
        onStrip={() => setPhase("strip")}
      />
    );
  return (
    <Camera
      info={info}
      name={me.name}
      left={left}
      used={taken.size}
      lastThumb={lastThumb}
      upload={{ sent: me.usedIdx, waiting: pendingIdx, failing, online }}
      onSendNow={() => void sync()}
      onMine={() => setPhase("mine")}
      onShot={async (video, preset, stamp) => {
        const idx = nextIdx(info.shots, taken);
        if (idx === null) return;
        const shot = await capture(video, preset, stamp);
        if (lastThumb) URL.revokeObjectURL(lastThumb);
        setLastThumb(URL.createObjectURL(shot.thumb));
        await add({ kind: "photo", idx, ...shot });
        if (taken.size + 1 >= info.shots) setTimeout(() => setPhase("done"), 700);
      }}
    />
  );
}
