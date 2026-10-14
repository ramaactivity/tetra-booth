"use client";
import { Check, Laptop, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { copy } from "@/lib/copy";
import { createUnitEvent, setUnitDevice } from "./units";

const t = copy.admin.units;
const SIZES = ["2R", "4R", "polaroid"] as const;
type Size = (typeof SIZES)[number];
const chip =
  "pressable inline-flex h-9 items-center gap-1.5 rounded-full border-[1.5px] border-ink px-3.5 text-[13px] font-bold";
const btn =
  "pressable inline-flex h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ink px-4 text-sm font-extrabold";

export type UnitRow = {
  spot: number;
  /** Event Booth unit ini; null = belum dibuat. */
  event: { id: string; slug: string; size: string | null; deviceId: string | null } | null;
  /** Ukuran frame menurut Ops (unit ≥ 2 dari `design.spots`), kalau ada. */
  opsSize: string | null;
};

/**
 * Acara multi-unit (#262): satu baris per unit dari booking Ops. Unit yang sudah ada = ukuran + laptop (bisa
 * dikunci ke satu laptop); unit yang belum = pilih ukuran & laptop lalu "Buat event Unit N".
 */
export function OpsUnits({
  current,
  units,
  devices,
}: {
  current: string;
  units: UnitRow[];
  devices: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<number, { size: Size | null; device: string | null }>>(
    () =>
      Object.fromEntries(
        units.map((u) => [
          u.spot,
          {
            size: (SIZES as readonly string[]).includes(u.opsSize ?? "")
              ? (u.opsSize as Size)
              : null,
            device: null,
          },
        ]),
      ),
  );
  const missing = units.filter((u) => !u.event).length;

  const Devices = ({
    value,
    onPick,
    disabled,
  }: {
    value: string | null;
    onPick: (id: string | null) => void;
    disabled?: boolean;
  }) => (
    <div className="flex flex-wrap gap-1.5">
      {[{ id: null, name: t.anyLaptop }, ...devices].map((d) => (
        <button
          key={d.id ?? "any"}
          type="button"
          aria-pressed={value === d.id}
          disabled={disabled}
          onClick={() => onPick(d.id)}
          className={`${chip} ${value === d.id ? "bg-lavender" : "bg-white"} disabled:opacity-50`}
        >
          {d.id && <Laptop aria-hidden className="size-3.5" strokeWidth={2.25} />}
          {d.name}
        </button>
      ))}
    </div>
  );

  return (
    <section
      data-testid="ops-units"
      className="mt-5 rounded-[18px] border-[1.5px] border-ink bg-white px-5 py-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-extrabold">{t.title(units.length)}</h2>
        <p className="text-[13px] text-text-2">{missing ? t.missing(missing) : t.allSet}</p>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-text-2">{t.why}</p>
      <ul className="mt-4 flex flex-col gap-3">
        {units.map((u) => {
          const d = draft[u.spot] ?? { size: null, device: null };
          const here = u.event?.id === current;
          return (
            <li
              key={u.spot}
              className={`rounded-xl border-[1.5px] px-4 py-3 ${here ? "border-ink bg-mint-soft" : "border-line-soft bg-paper"}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-extrabold">
                  {t.unit(u.spot)}
                  {u.event?.size && (
                    <span className="ml-2 rounded-full border-[1.5px] border-ink bg-butter px-2 py-0.5 text-[11px]">
                      {u.event.size}
                    </span>
                  )}
                  {here && <span className="ml-2 text-xs font-bold text-text-2">{t.here}</span>}
                </span>
                {u.event && !here && (
                  <Link
                    href={`/admin/events/${u.event.slug}`}
                    className="text-[13px] font-bold underline"
                  >
                    {t.open}
                  </Link>
                )}
              </div>
              {u.event ? (
                <div className="mt-2.5">
                  <p className="mb-1.5 text-xs font-bold text-text-2">{t.laptop}</p>
                  <Devices
                    value={u.event.deviceId}
                    disabled={pending}
                    onPick={(id) =>
                      start(async () => {
                        await setUnitDevice(u.event?.id ?? "", id);
                        router.refresh();
                      })
                    }
                  />
                </div>
              ) : (
                <div className="mt-2.5 flex flex-col gap-2.5">
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-text-2">
                      {t.size}
                      {u.opsSize && ` · ${t.fromOps(u.opsSize)}`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={d.size === s}
                          onClick={() => setDraft((x) => ({ ...x, [u.spot]: { ...d, size: s } }))}
                          className={`${chip} ${d.size === s ? "bg-lavender" : "bg-white"}`}
                        >
                          {d.size === s && (
                            <Check aria-hidden className="size-3.5" strokeWidth={3} />
                          )}
                          {s === "polaroid" ? "Polaroid" : s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-bold text-text-2">{t.laptop}</p>
                    <Devices
                      value={d.device}
                      onPick={(id) => setDraft((x) => ({ ...x, [u.spot]: { ...d, device: id } }))}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={!d.size || pending}
                    onClick={() =>
                      start(async () => {
                        setErr(null);
                        const r = await createUnitEvent({
                          eventId: current,
                          spot: u.spot,
                          size: d.size ?? "2R",
                          deviceId: d.device,
                        });
                        if (!r.ok) setErr(r.message);
                        else router.refresh();
                      })
                    }
                    className={`${btn} layered self-start bg-butter [--lb:1.5px] [--lx:4px] disabled:opacity-50`}
                  >
                    <Plus aria-hidden className="size-4" strokeWidth={2.5} />
                    {pending ? t.creating : t.create(u.spot)}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {err && <p className="mt-3 text-sm font-semibold text-coral-strong">{err}</p>}
    </section>
  );
}
