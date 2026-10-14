import { Button } from "@tetra/ui";
import { Play, X } from "lucide-react";
import { copy } from "../copy";

const t = copy.cancel;

/**
 * Tombol "Batal" di pojok kanan atas selama sesi mode event (Rama 14 Okt: tamu sering salah pencet, lalu harus
 * menunggu sesi selesai untuk kembali ke awal). Selalu lewat konfirmasi. Digeser dari pojok: area 72 px di kanan atas
 * adalah pintu masuk crew (5 ketukan, harus tetap bisa di layar kamera bermasalah, #170).
 */
export function CancelButton({
  disabled = false,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="plain"
      disabled={disabled}
      className="absolute top-10 right-[120px] z-20 h-[72px] rounded-[20px] bg-white/85! px-6 text-[24px]"
      onClick={onClick}
    >
      <X size={24} strokeWidth={2.5} />
      {t.button}
    </Button>
  );
}

/** Konfirmasi batal. Sesi ditahan selama tampil: timer berhenti, kamera tidak memotret. "Lanjut foto" = bawaan. */
export function CancelConfirm({ onYes, onNo }: { onYes: () => void; onNo: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-ink/55">
      <p className="rounded-[22px] border-[2.5px] border-ink bg-white px-10 py-5 text-center text-[42px] leading-tight font-extrabold">
        {t.title}
        <span className="mt-1 block text-[24px] font-semibold text-text-2">{t.sub}</span>
      </p>
      <div className="flex gap-6">
        <Button
          variant="plain"
          className="h-[112px] w-[400px] rounded-3xl bg-white! text-[32px]"
          onClick={onYes}
        >
          <X size={32} strokeWidth={2.5} />
          {t.yes}
        </Button>
        <Button className="h-[112px] w-[400px] rounded-3xl text-[32px]" onClick={onNo}>
          <Play size={30} strokeWidth={2.5} fill="currentColor" />
          {t.no}
        </Button>
      </div>
    </div>
  );
}
