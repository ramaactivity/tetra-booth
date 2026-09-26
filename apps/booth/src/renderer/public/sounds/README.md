# Paket suara bawaan booth (DECISIONS #103)

Diputar hanya kalau pengaturan event **Suara** menyala. File yang tidak ada = diam (angka & jepret memakai
nada Web Audio). Satu suara pada satu waktu. Suara kalimat hanya untuk kalimat bawaan (ucapan = tulisan di
`copy.prompts`); kalimat buatan event tampil tanpa suara kalimat.

Format: WAV mono 16-bit, hening di awal dipotong (±15 ms), volume disamakan (RMS ±−16 dBFS, puncak ≤ −1 dBFS).
Sumber mentah + skrip olah: lihat log HANDOFF 26 Sep 2026.

| File | Kapan | Ucapan |
|---|---|---|
| `mulai.wav` | tamu menyentuh mulai, hanya kalau ada layar pilih desain/layout | "Halooo, udah siap?…" |
| `foto-1.wav` | sebelum foto 1 | "Siap-siap, gaya pertama!" |
| `foto-2.wav` | sebelum foto 2 | "Gaya kedua, lebih seru!" |
| `foto-3.wav` | sebelum foto 3+ (bukan terakhir) | "Siap, lebih heboh ya!" |
| `foto-terakhir.wav` | sebelum foto terakhir | "Oke gaya terakhir, cheers!" |
| `3.wav` `2.wav` `1.wav` | angka hitung mundur | "Tiga" "Dua" "Satu" |
| `jepret.wav` | saat jepret | bunyi rana |
| `keren-1..4.wav` | setelah foto (acak, sama dengan tulisan) | "Mantap!" "Keren banget!" "Cakep!" "Wih, kalcer abis!" |
| `review.wav` | layar cek foto | "Cek dulu fotonya…" |
| `cetak.wav` | pilih jumlah cetak | "Mau cetak berapa lembar…" |
| `selesai.wav` | layar QR | "Buat download softfile-nya…" |
| `bayar.wav` | photobox: layar QRIS | "Halo, silakan scan QRIS…" |

## Kredit
- Suara kalimat: dibuat Tetra Photobooth (AI voice, Magnific).
- `jepret.wav`: "Single camera click with flash" oleh **theplax**, https://freesound.org/s/624923/ —
  lisensi **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/), diolah (mono, dipotong, volume).
