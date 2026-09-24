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
  const base = "flex size-20 items-center justify-center rounded border disabled:opacity-30";
  const key = `${base} border-line bg-surface text-3xl font-light`;
  return (
    <main className="flex h-full w-full flex-col items-center justify-center gap-8 bg-bg p-8 text-fg">
      <h1 className="text-2xl font-medium">{title}</h1>
      <div className="flex h-8 gap-3" data-testid="pin-dots">
        {["d1", "d2", "d3", "d4", "d5", "d6"].map((k, i) => (
          <span
            key={k}
            className={`size-4 rounded-full border border-fg ${i < pin.length ? "bg-fg" : ""}`}
          />
        ))}
      </div>
      <p className="h-6 text-sm text-accent" role="status">
        {locked ? copy.crew.pinLocked(Math.ceil(((lockedUntil ?? 0) - Date.now()) / 1000)) : msg}
      </p>
      <div className="grid grid-cols-3 gap-4">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            type="button"
            className={key}
            disabled={locked || pin.length >= 6}
            onClick={() => setPin(pin + d)}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          className={`${key} text-base uppercase tracking-label`}
          onClick={() => setPin(pin.slice(0, -1))}
        >
          {copy.crew.del}
        </button>
        <button
          type="button"
          className={key}
          disabled={locked || pin.length >= 6}
          onClick={() => setPin(`${pin}0`)}
        >
          0
        </button>
        <button
          type="button"
          className={`${base} border-accent bg-accent text-base text-on-accent uppercase tracking-label`}
          disabled={locked || pin.length < 4}
          onClick={() => void submit()}
        >
          {copy.crew.ok}
        </button>
      </div>
      <button
        type="button"
        className="min-h-16 px-6 text-sm uppercase tracking-label text-muted"
        onClick={onCancel}
      >
        {copy.crew.back}
      </button>
    </main>
  );
}
