import { useEffect, useState } from "react";
import { copy } from "../copy";
import { errText } from "../errors";
import { usePlatform } from "../PlatformContext";
import { DigitPad } from "./DigitPad";

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
  return (
    <DigitPad
      title={
        create ? (first === null ? copy.crew.pinCreate : copy.crew.pinConfirm) : copy.crew.pinEnter
      }
      value={pin}
      onChange={setPin}
      minBoxes={4}
      maxLength={6}
      masked
      status={
        locked ? copy.crew.pinLocked(Math.ceil(((lockedUntil ?? 0) - Date.now()) / 1000)) : msg
      }
      locked={locked}
      onSubmit={() => void submit()}
      onCancel={onCancel}
    />
  );
}
