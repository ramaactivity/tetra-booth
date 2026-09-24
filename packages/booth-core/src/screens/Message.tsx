import type { ReactNode } from "react";
import { copy } from "../copy";
import { Done } from "../ui";

/** Kartu tenang berlapis di tengah layar dengan spinner (A10). */
function Card({ children }: { children: ReactNode }) {
  return (
    <div className="layered relative flex w-[1180px] max-w-[calc(100%-96px)] flex-col items-center gap-[30px] rounded-[40px] border-[3px] border-ink bg-white p-[72px] text-center [--lb:3px] [--lx:14px]">
      <div className="size-[132px] animate-spin rounded-full border-[9px] border-[#e4e2dc] border-t-ink" />
      {children}
    </div>
  );
}

const title = "text-[68px] leading-[1.1] font-extrabold tracking-[-0.035em]";

/** Layar satu kalimat (menyusun strip). */
export function Message({ children }: { children: ReactNode }) {
  return (
    <main className="flex h-full w-full items-center justify-center bg-paper">
      <Card>
        <h1 className={title}>{children}</h1>
      </Card>
    </main>
  );
}

/** Kamera bermasalah, sambung ulang otomatis (A10). Tanpa kode error. */
export function CameraError({ attempt }: { attempt: number }) {
  return (
    <main className="relative flex h-full w-full items-center justify-center overflow-hidden bg-paper">
      <div className="absolute -top-[180px] -left-[180px] size-[640px] rounded-full bg-sky" />
      <Card>
        <h1 className={title}>{copy.camera.preparing}</h1>
        <p className="text-[28px] font-medium text-text-2">
          {copy.camera.retrying}{" "}
          {attempt > 0 && <span className="font-mono">{copy.camera.attempt(attempt)}</span>}
        </p>
        <p className="flex items-center gap-4 rounded-[20px] border-2 border-dashed border-ink bg-mint-soft px-7 py-[18px] text-[28px] font-bold">
          <Done size={40} />
          {copy.camera.safe}
        </p>
      </Card>
      <p className="absolute right-[72px] bottom-[52px] text-[22px] font-semibold text-text-2">
        {copy.camera.help}
      </p>
    </main>
  );
}
