import { copy } from "../copy";
import { CrewHotspot, useCrewKeys } from "../crew/CrewEntry";
import type { BoothEvent } from "../event";
import { useGuestPrinter } from "../GuestPrinter";
import { Logo, QrCode } from "../ui";

const t = copy.printStation;

/**
 * Print Station (#224): laptop + printer di acara Guest Cam tanpa photobooth. Tidak ada sesi foto: layar ini
 * menampilkan QR Guest Cam (tamu bisa ikut dari sini), cara mencetak, dan cetakan yang siap diambil (nomor + nama).
 * Pencetakannya sama dengan booth (`useGuestPrinter`, #223).
 */
export function PrintStation({
  event,
  guestBaseUrl,
  onCrew,
}: {
  event: BoothEvent;
  guestBaseUrl: string;
  onCrew: (intent?: "exit") => void;
}) {
  useCrewKeys(onCrew);
  const { on, recent } = useGuestPrinter(event);
  return (
    <main
      data-testid="print-station"
      className="relative grid h-full w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-14 bg-paper px-20 py-16"
    >
      <CrewHotspot onCrew={onCrew} />
      <section className="flex min-h-0 flex-col">
        <Logo />
        <p className="mt-12 text-3xl font-bold text-text-2">{event.name}</p>
        <h1 className="mt-3 text-[68px] leading-[0.95] font-extrabold tracking-[-0.04em] text-balance">
          {t.title}
        </h1>
        <ol className="mt-10 flex flex-col gap-5">
          {t.steps.map((s, i) => (
            <li key={s} className="flex items-center gap-5 text-[30px] font-semibold">
              <span className="flex size-14 flex-none items-center justify-center rounded-full border-[2.5px] border-ink bg-butter font-mono text-2xl font-bold">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
        <div className="mt-auto flex items-end gap-6">
          {event.guestCam ? (
            <>
              <div className="layered rounded-[24px] border-[2.5px] border-ink bg-white p-5 [--lx:10px] [--under:var(--mint)]">
                <QrCode url={`${guestBaseUrl}${event.guestCam}`} size={260} />
              </div>
              <p className="max-w-[360px] pb-3 text-[30px] leading-tight font-extrabold">
                {t.scan}
              </p>
            </>
          ) : (
            <p className="rounded-[18px] border-2 border-dashed border-ink bg-peach px-6 py-4 text-2xl font-semibold">
              {t.noLink}
            </p>
          )}
        </div>
      </section>
      <section className="flex min-h-0 flex-col rounded-[32px] border-[2.5px] border-ink bg-white p-10">
        <h2 className="text-[44px] font-extrabold tracking-[-0.02em]">{t.ready}</h2>
        {!on ? (
          <p className="mt-8 rounded-[18px] border-2 border-dashed border-ink bg-peach px-6 py-5 text-2xl font-semibold">
            {t.off}
          </p>
        ) : recent.length === 0 ? (
          <p className="mt-8 text-2xl text-text-2">{t.empty}</p>
        ) : (
          <ul className="mt-8 flex min-h-0 flex-col gap-4 overflow-hidden">
            {recent.slice(0, 7).map((r, i) => (
              <li
                key={r.id}
                data-testid="print-station-item"
                className={`flex items-center gap-6 rounded-[22px] border-[2.5px] border-ink px-6 py-4 ${r.ok ? (i < 2 ? "bg-mint-soft" : "bg-white") : "bg-coral"}`}
              >
                <span className="font-mono text-[44px] font-bold">#{r.number}</span>
                <span className="min-w-0 flex-1 truncate text-[34px] font-extrabold">
                  {r.name ?? ""}
                </span>
                {!r.ok && <span className="text-2xl font-bold">{t.failed}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
