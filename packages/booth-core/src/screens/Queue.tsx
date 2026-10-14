import { Button } from "@tetra/ui";
import { Ticket } from "lucide-react";
import { useEffect } from "react";
import { copy } from "../copy";

const t = copy.queue;
/** Tiket ditinggal tamu: tutup sendiri supaya layar awal tidak tertahan. */
const TICKET_MS = 10_000;

/** Baris antrean di layar awal photobox: nomor yang dipanggil + tombol ambil nomor (dengan jumlah yang antre). */
export function QueueBar({
  called,
  waiting,
  onTake,
}: {
  called: number | null;
  waiting: number;
  onTake: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-5">
      {called !== null && (
        <p
          data-testid="queue-called"
          className="flex h-24 items-center gap-4 rounded-[24px] border-[2.5px] border-ink bg-butter px-7 text-[30px] font-bold whitespace-nowrap"
        >
          {t.called}
          <span className="font-mono text-[52px] font-extrabold tabular-nums">{called}</span>
          {t.calledSub}
        </p>
      )}
      <Button
        variant="secondary"
        data-testid="queue-take"
        className="h-24 rounded-[24px] pr-4 pl-7 text-[30px] whitespace-nowrap"
        onClick={onTake}
      >
        <Ticket size={34} strokeWidth={2.25} />
        {t.take}
        {waiting > 0 && (
          <span className="ml-2 rounded-full border-2 border-ink bg-white px-4 py-1 text-2xl">
            {t.waiting(waiting)}
          </span>
        )}
      </Button>
    </div>
  );
}

/** Tiket nomor antrean setelah tamu mengambil nomor. `ahead` = nomor sebelum dia (0 = gilirannya sekarang). */
export function QueueTicket({
  number,
  ahead,
  onClose,
}: {
  number: number;
  ahead: number;
  onClose: () => void;
}) {
  useEffect(() => {
    const id = setTimeout(onClose, TICKET_MS);
    return () => clearTimeout(id);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/55">
      <div
        data-testid="queue-ticket"
        className="flex w-[760px] flex-col items-center gap-5 rounded-[40px] border-[3px] border-ink bg-white px-14 py-12 text-center"
      >
        <p className="text-[34px] font-bold">{t.ticketTitle}</p>
        <p className="rounded-[32px] border-[3px] border-ink bg-butter px-16 font-mono text-[200px] leading-[1.1] font-extrabold tabular-nums">
          {number}
        </p>
        <p className="text-[30px] leading-tight font-bold">{t.ahead(ahead)}</p>
        <p className="text-[24px] font-semibold text-text-2">{t.ticketHint}</p>
        <Button className="mt-2 h-[112px] w-[400px] rounded-3xl text-[36px]" onClick={onClose}>
          {t.ok}
        </Button>
      </div>
    </div>
  );
}
