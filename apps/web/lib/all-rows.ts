/**
 * PostgREST memotong hasil di `max_rows` (Supabase: 1000) TANPA error: galeri acara 240 sesi dulu hanya menampilkan
 * 151 strip (audit 27 Nov). Ambil per halaman sampai habis. Query wajib berurutan tetap (order unik, mis. id) supaya
 * halaman tidak tumpang tindih. Error dilempar, bukan dianggap kosong.
 */
export const PAGE = 1000;
export async function allRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return out;
  }
}
