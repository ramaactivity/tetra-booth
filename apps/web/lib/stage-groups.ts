/**
 * Daftar grup Photo Stage (#181): satu grup per baris (tempel dari WA/Excel, atau impor CSV). Baris berkolom (tab dari Excel,
 * `;` dari CSV Excel Indonesia) = kolom pertama; koma tidak dipisah karena sering ada di nama; nomor urut "1." / "1)" di depan dibuang; duplikat & baris kosong dibuang.
 */
export const groupLines = (v: FormDataEntryValue | null) =>
  [
    ...new Set(
      String(v ?? "")
        .split(/\r?\n/)
        .map((l) =>
          (l.split(/\t|;/)[0] ?? "")
            .replace(/^"|"$/g, "")
            .replace(/^\s*\d+[.)]\s+/, "")
            .trim()
            .slice(0, 120),
        )
        .filter(Boolean),
    ),
  ].slice(0, 300);
