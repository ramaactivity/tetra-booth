import type { Metadata } from "next";
import { copy } from "@/lib/copy";
import { guestEvent, guestInfo, guestMe, guestSession } from "@/lib/guest-cam";
import { GuestCam } from "./GuestCam";

const t = copy.guestCam;

export const metadata: Metadata = { title: t.meta, robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Guest Cam (#197): tamu memotret dari HP lewat QR. UI sementara; diganti desain Claude Design (G5). */
export default async function GuestCamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ev = await guestEvent(token);
  if (!ev)
    return (
      <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-extrabold">{t.gone}</h1>
        <p className="text-sm text-text-2">{t.goneBody}</p>
      </main>
    );
  const session = await guestSession(ev);
  return (
    <GuestCam
      token={token}
      info={await guestInfo(ev)}
      initialMe={session ? await guestMe(ev, session) : null}
    />
  );
}
