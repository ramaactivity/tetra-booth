"use client";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";

const t = copy.guest;
/** Browser di dalam aplikasi (scan QR dari Instagram/TikTok/Facebook/Line): simpan foto sering gagal di sana. */
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|BytedanceWebview|musical_ly|Snapchat/i;

/** Petunjuk buka di Safari/Chrome (audit 27 Nov). Android: tombol intent langsung ke Chrome. */
export function InAppHint() {
  const [os, setOs] = useState<"ios" | "android" | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    if (IN_APP.test(ua)) setOs(/Android/i.test(ua) ? "android" : "ios");
  }, []);
  if (!os) return null;
  const chrome = `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
  return (
    <div
      role="note"
      data-testid="in-app-hint"
      className="mx-5 mt-4 mb-4 flex flex-col gap-2.5 rounded-xl border-[1.5px] border-ink bg-butter px-3.5 py-3 text-[13px] leading-[1.5]"
    >
      <p>
        <b>{t.inAppTitle}</b> {os === "android" ? t.inAppAndroid : t.inAppIos}
      </p>
      {os === "android" && (
        <a
          href={chrome}
          className="pressable flex h-11 items-center justify-center rounded-xl border-[1.5px] border-ink bg-white text-[15px] font-extrabold text-ink no-underline"
        >
          {t.openChrome}
        </a>
      )}
    </div>
  );
}
