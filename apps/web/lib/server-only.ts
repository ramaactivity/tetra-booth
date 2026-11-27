/**
 * Pengganti paket `server-only` untuk modul yang juga dipakai Pages API (`pages/api/g/[token]/zip.ts`): paket aslinya
 * melempar error di luar React Server Components. Modul ini tetap gagal kalau sampai terbundel ke browser.
 */
if (typeof window !== "undefined") throw new Error("Modul server tidak boleh dipakai di browser");

export {};
