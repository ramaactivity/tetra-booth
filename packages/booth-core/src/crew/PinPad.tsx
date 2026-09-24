import { Button } from "@tetra/ui";
import { Delete } from "lucide-react";
import { useEffect, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { usePlatform } from "../PlatformContext";

/** PIN crew: verifikasi, atau buat baru (dua kali) kalau belum ada / diminta ganti. */
export function PinPad({
  create,
  onDone,
  onCancel,
}: {
  create: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { crew } = usePlatform();
  const [pin, setPin] = useState("");
  const [first, setFirst] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (!lockedUntil) return;
    const t = setInterval(
      () => (Date.now() >= lockedUntil ? setLockedUntil(null) : tick((n) => n + 1)),
      1000,
    );
    return () => clearInterval(t);
  }, [lockedUntil]);

  const submit = async () => {
    if (pin.length < 4) return;
    try {
      if (create && first === null) {
        setFirst(pin);
        setPin("");
        setMsg(null);
        return;
      }
      if (create) {
        if (pin !== first) {
          setFirst(null);
          setPin("");
          setMsg(copy.crew.pinMismatch);
          return;
        }
        await crew.setPin(pin);
        onDone();
        return;
      }
      const r = await crew.verifyPin(pin);
      setPin("");
      if (r.ok) onDone();
      else {
        setLockedUntil(r.lockedUntil);
        setMsg(copy.crew.pinWrong);
      }
    } catch (e) {
      setMsg(errText(e));
    }
  };

  const locked = lockedUntil !== null && Date.now() < lockedUntil;
  const title = create
    ? first === null
      ? copy.crew.pinCreate
      : copy.crew.pinConfirm
    : copy.crew.pinEnter;
  const full = locked || pin.length >= 6;
  // PIN 4–6 digit: kotak bertambah sampai 6 saat diketik.
  const boxes = Math.min(6, Math.max(4, pin.length + 1));
  const key =
    "pressable flex h-[92px] items-center justify-center rounded-[22px] border-[2.5px] border-ink bg-white text-[40px] font-bold disabled:opacity-40";
  const digit = (d: string) => (
    <button key={d} type="button" className={key} disabled={full} onClick={() => setPin(pin + d)}>
      {d}
    </button>
  );
  return (
    <main className="flex h-full w-full items-center justify-center bg-paper">
      <div className="layered flex flex-col items-center gap-8 rounded-[40px] border-[3px] border-ink bg-white px-[72px] py-14 [--lb:3px] [--lx:14px]">
        <span className="rounded-full border-2 border-ink bg-lavender px-[18px] py-2 text-xl font-bold">
          {copy.crew.title}
        </span>
        <h1 className="text-[52px] font-extrabold tracking-[-0.03em]">{title}</h1>
        <div className="relative flex gap-[18px]" data-testid="pin-dots">
          {Array.from({ length: boxes }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: posisi digit tetap
              key={i}
              className={`flex h-[84px] w-[72px] items-center justify-center rounded-[18px] border-ink ${
                i < pin.length
                  ? "border-[2.5px] bg-paper"
                  : i === pin.length
                    ? "border-[3px] bg-white shadow-[0_0_0_5px_var(--mint)]"
                    : "border-[2.5px] border-dashed bg-white"
              }`}
            >
              {i < pin.length && <span className="size-5 rounded-full bg-ink" />}
            </span>
          ))}
          <p
            className="absolute inset-x-[-200px] top-full mt-2 text-center text-xl font-semibold text-text-2"
            role="status"
          >
            {locked
              ? copy.crew.pinLocked(Math.ceil(((lockedUntil ?? 0) - Date.now()) / 1000))
              : msg}
          </p>
        </div>
        <div className="grid grid-cols-[repeat(3,140px)] gap-[18px]">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(digit)}
          <button type="button" className={`${key} bg-paper! text-2xl!`} onClick={onCancel}>
            {copy.crew.cancel}
          </button>
          {digit("0")}
          <button
            type="button"
            aria-label={copy.crew.del}
            className={`${key} bg-paper!`}
            onClick={() => setPin(pin.slice(0, -1))}
          >
            <Delete size={40} strokeWidth={2} />
          </button>
          <Button
            className="col-span-3 h-[92px] rounded-[22px] text-[32px]"
            disabled={locked || pin.length < 4}
            onClick={() => void submit()}
          >
            {copy.crew.ok}
          </Button>
        </div>
      </div>
    </main>
  );
}
