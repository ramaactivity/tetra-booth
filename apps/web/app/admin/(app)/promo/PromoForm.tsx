"use client";
import { useActionState, useState } from "react";
import type { Discount, PromoConfig } from "@/lib/promo";
import { Box } from "../events/[id]/settings/SettingsForm";
import { type SaveResult, savePromo } from "./actions";

const DISCOUNTS: [Discount["type"], string][] = [
  ["percent", "Diskon persen"],
  ["amount", "Potongan nominal"],
  ["item", "Bonus layanan"],
];

const input =
  "h-11 w-full rounded-[11px] border-[1.5px] border-ink bg-white px-3 text-sm outline-none focus:shadow-[0_0_0_3px_var(--mint)]";

function Field({
  name,
  label,
  hint,
  value,
  placeholder,
}: {
  name: string;
  label: string;
  hint: string;
  value: string | undefined;
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-bold">{label}</span>
      <input name={name} defaultValue={value ?? ""} placeholder={placeholder} className={input} />
      <span className="text-xs leading-normal text-text-2">{hint}</span>
    </label>
  );
}

/** Pengaturan kartu promosi halaman tamu (#215). Kolom kosong = tombolnya tidak tampil. */
export function PromoForm({ cfg }: { cfg: PromoConfig }) {
  const [res, action, pending] = useActionState<SaveResult, FormData>(savePromo, null);
  const d = cfg.offer?.discount;
  const [dtype, setDtype] = useState<Discount["type"]>(d?.type ?? "percent");
  return (
    <form
      action={action}
      className="flex flex-col gap-5 rounded-2xl border-[1.5px] border-ink bg-white p-6"
    >
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <Field
          name="whatsapp"
          label="WhatsApp admin"
          hint="Tombol “Chat admin”. Wajib untuk mengumpulkan nomor & promo."
          value={cfg.whatsapp}
          placeholder="0812 3456 7890"
        />
        <Field
          name="instagram"
          label="Instagram"
          hint="Tamu diajak follow & tag akun ini (bersama IG klien di event)."
          value={cfg.instagram}
          placeholder="tetraphotobooth"
        />
        <Field
          name="tiktok"
          label="TikTok"
          hint="Kosongkan kalau tidak dipakai."
          value={cfg.tiktok}
          placeholder="tetraphotobooth"
        />
        <Field
          name="reviewUrl"
          label="Link ulasan Google"
          hint="Google Bisnis → Minta ulasan → salin link (g.page/r/…/review)."
          value={cfg.reviewUrl}
          placeholder="https://g.page/r/…/review"
        />
        <Field
          name="website"
          label="Paket & harga"
          hint="Link pricelist / website untuk tamu yang malu langsung chat."
          value={cfg.website}
          placeholder="https://tetraphoto.com/pricelist"
        />
      </div>
      <fieldset className="flex flex-col gap-3 rounded-[14px] border-[1.5px] border-dashed border-ink p-4">
        <label className="flex cursor-pointer items-center gap-3 text-sm font-bold">
          <Box name="offer" defaultChecked={!!cfg.offer} />
          Promo tamu: tinggalkan nomor WA, lalu kirim bukti → kode promo unik
        </label>
        <div className="flex flex-wrap gap-5 text-sm font-semibold">
          {DISCOUNTS.map(([v, label]) => (
            <label key={v} className="flex cursor-pointer items-center gap-2.5">
              <Box
                radio
                name="dtype"
                value={v}
                defaultChecked={dtype === v}
                onChange={() => setDtype(v)}
              />
              {label}
            </label>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {dtype === "percent" && (
            <>
              <Field
                name="dvalue"
                label="Diskon (%)"
                hint="1–100."
                value={d?.type === "percent" ? String(d.value) : undefined}
                placeholder="10"
              />
              <Field
                name="maxIdr"
                label="Potongan maks. (Rp)"
                hint="Kosong = tanpa batas."
                value={d?.type === "percent" && d.maxIdr ? String(d.maxIdr) : undefined}
                placeholder="300000"
              />
            </>
          )}
          {dtype === "amount" && (
            <Field
              name="dvalue"
              label="Potongan (Rp)"
              hint="Nominal tetap."
              value={d?.type === "amount" ? String(d.value) : undefined}
              placeholder="200000"
            />
          )}
          {dtype === "item" && (
            <Field
              name="item"
              label="Bonus"
              hint="Mis. “Gratis Guest Cam” (Ops menambahkannya Rp0)."
              value={d?.type === "item" ? d.item : undefined}
              placeholder="Gratis Guest Cam"
            />
          )}
          <Field
            name="minIdr"
            label="Minimal booking (Rp)"
            hint="Kosong = tanpa minimal."
            value={cfg.offer?.minIdr ? String(cfg.offer.minIdr) : undefined}
            placeholder="2000000"
          />
          <Field
            name="validDays"
            label="Berlaku (hari)"
            hint="Sejak kode diklaim, 7–365."
            value={String(cfg.offer?.validDays ?? 90)}
            placeholder="90"
          />
        </div>
        <div className="flex flex-wrap gap-5 text-sm font-semibold">
          <label className="flex cursor-pointer items-center gap-2.5">
            <Box
              name="proof_instagram"
              defaultChecked={cfg.offer?.proofs.includes("instagram") ?? true}
            />
            Bukti: story yang men-tag IG
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <Box
              name="proof_review"
              defaultChecked={cfg.offer?.proofs.includes("review") ?? true}
            />
            Bukti: ulasan Google
          </label>
        </div>
        <p className="text-xs leading-normal text-text-2">
          Catatan: kebijakan Google melarang memberi imbalan untuk ulasan; ulasan bisa dihapus kalau
          ketahuan. Matikan “ulasan Google” kalau tidak mau mengambil risiko itu.
        </p>
      </fieldset>
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="pressable layered h-11 rounded-xl border-[1.5px] border-ink bg-butter px-6 text-sm font-extrabold [--lb:1.5px] [--lx:4px] disabled:opacity-50"
        >
          {pending ? "Menyimpan…" : "Simpan"}
        </button>
        {res && (
          <p
            role={res.ok ? "status" : "alert"}
            className={`text-sm font-semibold ${res.ok ? "text-green" : "text-coral-strong"}`}
          >
            {res.ok ? "Tersimpan" : res.message}
          </p>
        )}
      </div>
    </form>
  );
}
