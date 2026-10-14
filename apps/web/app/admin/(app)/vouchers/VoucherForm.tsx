"use client";
import { Select, type SelectOption } from "@tetra/ui";
import { useActionState, useState } from "react";
import { copy } from "@/lib/copy";
import { createVoucher, type VoucherResult } from "./actions";

const t = copy.admin.vouchers;
const input =
  "h-11 w-full rounded-[11px] border-[1.5px] border-ink bg-white px-3 text-sm outline-none focus:shadow-[0_0_0_3px_var(--mint)]";

/** Label + kontrol + petunjuk. `id` = input biasa; tanpa `id` = Select Tetra (punya nama aksesibel sendiri). */
function Field({
  id,
  label,
  hint,
  children,
}: {
  id?: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {id ? (
        <label htmlFor={id} className="text-[13px] font-bold">
          {label}
        </label>
      ) : (
        <span className="text-[13px] font-bold">{label}</span>
      )}
      {children}
      {hint && <span className="text-xs leading-normal text-text-2">{hint}</span>}
    </div>
  );
}

/** Form buat voucher photobox. Kode diketik bebas, server menyimpannya huruf besar tanpa spasi. */
export function VoucherForm({ events }: { events: SelectOption[] }) {
  const [res, action, pending] = useActionState<VoucherResult, FormData>(createVoucher, null);
  const [kind, setKind] = useState("amount");
  const [event, setEvent] = useState("");
  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-2xl border-[1.5px] border-ink bg-white p-6"
    >
      <h2 className="text-base font-extrabold">{t.newTitle}</h2>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <Field id="v-code" label={t.code} hint={t.codeHint}>
          <input
            name="code"
            id="v-code"
            required
            maxLength={24}
            autoComplete="off"
            placeholder="MALL10"
            className={`${input} font-mono uppercase`}
          />
        </Field>
        <Field label={t.kind}>
          <Select
            name="kind"
            label={t.kind}
            value={kind}
            onChange={setKind}
            options={[
              { value: "amount", label: t.kindAmount },
              { value: "percent", label: t.kindPercent },
            ]}
          />
        </Field>
        <Field id="v-value" label={t.value} hint={t.valueHint}>
          <input
            name="value"
            id="v-value"
            type="number"
            required
            min={1}
            max={kind === "percent" ? 100 : 10_000_000}
            placeholder={kind === "percent" ? "20" : "10000"}
            className={`${input} font-mono`}
          />
        </Field>
        <Field id="v-max_uses" label={t.maxUses} hint={t.maxUsesHint}>
          <input
            name="max_uses"
            id="v-max_uses"
            type="number"
            min={1}
            placeholder={t.unlimited}
            className={`${input} font-mono`}
          />
        </Field>
        <Field id="v-from" label={t.from} hint={t.datesHint}>
          <input name="from" id="v-from" type="date" className={input} />
        </Field>
        <Field id="v-to" label={t.to}>
          <input name="to" id="v-to" type="date" className={input} />
        </Field>
        <Field label={t.event}>
          <Select
            name="event_id"
            label={t.event}
            value={event}
            onChange={setEvent}
            searchable
            options={[{ value: "", label: t.allEvents }, ...events]}
          />
        </Field>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-6 text-sm font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
        >
          {pending ? t.creating : t.create}
        </button>
        {res && (
          <p
            role={res.ok ? "status" : "alert"}
            className={`text-sm font-semibold ${res.ok ? "text-green" : "text-coral-strong"}`}
          >
            {res.ok ? t.created : res.message}
          </p>
        )}
      </div>
    </form>
  );
}
