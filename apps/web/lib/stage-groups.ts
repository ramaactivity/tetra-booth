/**
 * Daftar grup Photo Stage (#181): satu grup per baris (tempel dari WA/Excel, atau impor CSV). Baris berkolom (tab dari Excel,
 * `;` dari CSV Excel Indonesia) = kolom pertama; koma tidak dipisah karena sering ada di nama; nomor urut "1." / "1)" di depan dibuang; duplikat & baris kosong dibuang.
 * Judul kolom ("Nama grup", "Nama", "Grup", …) dilewati (#192).
 */
const HEADER = /^(no\.?\s*)?(nama( grup| rombongan| tamu)?|grup|group|name|rombongan)$/i;
/** Nama grup per baris setelah dibersihkan, urutan & duplikat tetap (untuk deteksi nama ganda di admin). */
export const groupNames = (v: FormDataEntryValue | null) =>
  String(v ?? "")
    .split(/\r?\n/)
    .map((l) =>
      (l.split(/\t|;/)[0] ?? "")
        .replace(/^"|"$/g, "")
        .replace(/^\s*\d+[.)]\s+/, "")
        .trim()
        .slice(0, 120),
    )
    .filter((l) => l && !HEADER.test(l));

export const groupLines = (v: FormDataEntryValue | null) =>
  [...new Set(groupNames(v))].slice(0, 300);
