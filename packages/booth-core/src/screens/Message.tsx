import type { ReactNode } from "react";
import { copy } from "../copy";
import { CrewHotspot, useCrewKeys } from "../crew/CrewEntry";
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

/** Setelah sekian percobaan, nomor percobaan tidak ditampilkan lagi (angka ratusan hanya membuat tamu cemas). */
export const SHOW_ATTEMPTS = 10;

/**
 * Kamera bermasalah, sambung ulang otomatis (A10). Tanpa kode error. Crew selalu bisa masuk dari sini (#170):
 * ketuk pojok kanan atas 5× atau Ctrl+Shift+M, sama seperti layar awal.
 */
export function CameraError({
  attempt,
  onCrew,
  afHint = false,
}: {
  attempt: number;
  /** Jepret terakhir gagal karena kamera sibuk/tidak menjawab: saran AF → MF untuk crew. */
  afHint?: boolean;
  onCrew?: ((intent?: "exit") => void) | undefined;
}) {
  useCrewKeys(onCrew);
  return (
    <main className="relative flex h-full w-full flex-col items-center justify-center gap-7 overflow-hidden bg-paper">
      <div className="absolute -top-[180px] -left-[180px] size-[640px] rounded-full bg-sky" />
      <Card>
        <h1 className={title}>{copy.camera.preparing}</h1>
        <p className="text-[28px] font-medium text-text-2">
          {copy.camera.retrying}{" "}
          {attempt > 0 && attempt <= SHOW_ATTEMPTS && (
            <span className="font-mono">{copy.camera.attempt(attempt)}</span>
          )}
        </p>
        <p className="flex items-center gap-4 rounded-[20px] border-2 border-dashed border-ink bg-mint-soft px-7 py-[18px] text-[28px] font-bold">
          <Done size={40} />
          {copy.camera.safe}
        </p>
      </Card>
      {afHint && (
        <div
          data-testid="camera-af-hint"
          className="relative w-[1180px] max-w-[calc(100%-96px)] rounded-[22px] border-2 border-ink bg-peach px-7 py-4 text-[24px]"
        >
          <p className="font-bold">{copy.camera.afTitle}</p>
          <ol className="mt-1.5 list-decimal pl-8 font-medium">
            {copy.camera.afSteps.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </div>
      )}
      <p
        data-testid="camera-help"
        className={`absolute right-[72px] bottom-[52px] font-semibold ${attempt > SHOW_ATTEMPTS ? "rounded-full border-2 border-ink bg-butter px-6 py-2 text-[28px] text-ink" : "text-[22px] text-text-2"}`}
      >
        {copy.camera.help}
      </p>
      <CrewHotspot onCrew={onCrew} />
    </main>
  );
}
