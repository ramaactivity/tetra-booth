import { useState } from "react";
import { copy } from "../copy";
import { crewText } from "../errors";
import { usePlatform } from "../PlatformContext";
import { DigitPad } from "./DigitPad";

/** Pasangkan booth ke cloud dengan kode 6 digit dari owner (FSD §1.2). */
export function PairPad({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { crew } = usePlatform();
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setMsg(copy.crew.pairing);
    try {
      await crew.pair(code);
      onDone();
    } catch (e) {
      setCode("");
      setMsg(crewText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DigitPad
      title={copy.crew.pairTitle}
      value={code}
      onChange={setCode}
      minBoxes={6}
      maxLength={6}
      masked={false}
      status={msg}
      locked={busy}
      onSubmit={() => void submit()}
      onCancel={onCancel}
    />
  );
}
