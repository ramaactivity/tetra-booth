"use client";

/** Cadangan unduh PDF (#230): cetak lewat dialog browser, mis. langsung ke printer rumah. */
export function PrintLink() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="self-start text-xs font-bold text-text-2 underline underline-offset-2"
    >
      Atau cetak lewat browser
    </button>
  );
}
