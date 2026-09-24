/** Semua teks UI booth, Bahasa Indonesia. 08-DESIGN §7: pendek, label tombol maksimal 2 kata. */
export const copy = {
  attract: { cta: "Sentuh untuk mulai" },
  countdown: {
    ready: "Siap? Senyum!",
    progress: (n: number, total: number) => `Foto ${n} dari ${total}`,
  },
  review: { title: "Cek fotonya dulu", retake: "Ulang", next: "Lanjut" },
  compose: { busy: "Menyusun fotomu…" },
  print: {
    title: "Mau cetak berapa?",
    print: "Cetak",
    less: "Kurangi",
    more: "Tambah",
    busy: "Sedang mencetak…",
  },
  qr: { title: "Scan untuk simpan fotomu", done: "Selesai" },
  camera: { preparing: "Sebentar ya, kamera lagi disiapkan" },
  payment: {
    expired: "Waktu pembayaran habis",
    retry: "Buat ulang",
    offline: "Pembayaran belum bisa diproses, hubungi crew",
  },
  crew: { title: "Mode crew", exit: "Keluar kiosk" },
} as const;
