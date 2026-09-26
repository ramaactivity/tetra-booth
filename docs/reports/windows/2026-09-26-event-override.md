# Pengaturan event di booth: override lokal (DECISIONS #100), 2026-09-26

## Yang dibangun
- Mode crew → **Pengaturan Event** (tombol di grid aksi, nonaktif tanpa event bundle). Stepper −/+ untuk
  hitung mundur, jatah foto ulang, maks. cetak, layar QR, dan timer sesi photobox (hanya event photobox). Batas nilai
  sama dengan `EventSettingsSchema`. Tiap baris menampilkan `cloud: n` dan badge **diubah di booth** kalau di-override.
- Kartu event aktif di header crew menampilkan badge "Pengaturan diubah di booth". Tombol **Kembalikan ke cloud**
  menghapus semua override.
- Penyimpanan: `kv` SQLite, kunci `event_override:<eventId>`, berisi JSON hanya untuk field yang beda dari cloud
  (`apps/booth/src/main/event-override.ts`). `eventsList` menerapkan override ke `settings`, sehingga sesi, sync,
  dan layar awal memakai jalur yang sama. Folder bundle tidak disentuh, jadi Sync dari Cloud tidak menimpa override.
  Template, desain, harga, dan lead capture tidak bisa diubah dari sini.
- Tanpa endpoint baru. Override tetap berlaku setelah booth dibuka ulang atau di-update, karena ada di `db.sqlite`.

## Uji
- Unit `event-override.test.ts`: diff hanya field yang berubah, apply/kosong, kv rusak / di luar batas / field lain
  diabaikan. Test ini menangkap bug: `EventSettingsSchema.pick().partial()` masih mengisi default zod (override
  berisi semua field default dan akan menimpa nilai cloud). Skema override sekarang dibuat tanpa `.default()`.
- e2e `crew.spec`: ubah hitung mundur 3 → 5 → badge di sheet dan header → Kembalikan ke cloud → badge hilang.
  Field timer photobox tidak muncul untuk event mode event.
- Manual (booth dev, kamera simulasi, bundle Andi & Sari): hitung mundur di-override ke 5 → sesi berikutnya mulai
  dari **5** (cloud 3). Log `[event] pengaturan andi-sari di booth: {"countdownSec":5}`.
- biome exit 0, typecheck, unit (shared 18, booth-core 22, booth 44), e2e booth 8/8.
