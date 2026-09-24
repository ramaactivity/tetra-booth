"use client";
import { useActionState, useState } from "react";
import { addDevice, newPairingCode, type PairResult, revokeDevice } from "./actions";

/** Panel kode pairing (E5): kode per karakter + penjelasan. */
function CodePanel({ r }: { r: PairResult }) {
  if (!r) return null;
  if ("error" in r) return <p className="text-sm font-semibold text-coral-strong">{r.error}</p>;
  return (
    <div
      className="flex max-w-[680px] items-center gap-6 rounded-[18px] border-[1.5px] border-dashed border-ink bg-sky px-[22px] py-[18px]"
      data-testid="pair-code"
    >
      <div className="flex gap-1.5">
        {[...r.code].map((c, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: posisi digit tetap
            key={i}
            className="flex h-[50px] w-10 items-center justify-center rounded-[10px] border-[1.5px] border-ink bg-white font-mono text-[22px]"
          >
            {c}
          </span>
        ))}
      </div>
      <div>
        <div className="text-sm font-extrabold">Kode pairing {r.name}</div>
        <div className="mt-0.5 text-xs leading-normal text-text-3">
          Di booth: mode crew → kartu Koneksi → Pasangkan → ketik kode ini. Berlaku 10 menit.
        </div>
      </div>
    </div>
  );
}

export function AddDevice() {
  const [r, action, pending] = useActionState(addDevice, null);
  const [open, setOpen] = useState(false);
  return (
    <>
      {open ? (
        <form action={action} className="flex items-center gap-2.5">
          <input
            name="name"
            placeholder="Nama booth, mis. Booth 01 – Asus"
            required
            className="h-11 w-72 rounded-xl border-[1.5px] border-ink bg-white px-3.5 text-sm"
          />
          <button
            type="submit"
            disabled={pending}
            className="pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
          >
            Daftarkan
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-[18px] text-sm font-extrabold [--lb:1.5px] [--lx:4px]"
        >
          + Daftarkan Device
        </button>
      )}
      <div className="w-full basis-full">
        <CodePanel r={r} />
      </div>
    </>
  );
}

export function DeviceActions({ id, name }: { id: string; name: string }) {
  const [r, setR] = useState<PairResult>(null);
  return (
    <>
      {r && (
        <div className="px-[18px] pb-3">
          <CodePanel r={r} />
        </div>
      )}
      <div className="mt-auto flex border-t-[1.5px] border-ink">
        <button
          type="button"
          className="h-[42px] flex-1 text-xs font-bold"
          onClick={async () => setR(await newPairingCode(id))}
        >
          Kode Pairing
        </button>
        <button
          type="button"
          className="h-[42px] flex-1 border-l-[1.5px] border-ink bg-coral text-xs font-bold"
          onClick={async () => {
            if (confirm(`Nonaktifkan ${name}? Booth harus dipasangkan ulang sebagai device baru.`))
              await revokeDevice(id);
          }}
        >
          Nonaktifkan
        </button>
      </div>
    </>
  );
}
