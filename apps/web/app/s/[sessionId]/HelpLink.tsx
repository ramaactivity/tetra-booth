"use client";
import { waLink } from "@/lib/contact";
import { copy } from "@/lib/copy";

/** Tombol tanya Tetra lewat WA, berisi link halaman ini (audit 27 Nov). */
export function HelpLink({ className = "" }: { className?: string }) {
  return (
    <a
      // Link halaman diisi saat diketuk (server tidak tahu alamat lengkapnya; hindari beda render server/klien).
      href={waLink(copy.guest.helpText(""))}
      onClick={(e) => {
        e.currentTarget.href = waLink(copy.guest.helpText(location.href));
      }}
      target="_blank"
      rel="noopener"
      className={`pressable flex h-12 items-center justify-center rounded-xl border-[1.5px] border-ink bg-white px-4 text-sm font-bold no-underline ${className}`}
    >
      {copy.guest.help}
    </a>
  );
}
