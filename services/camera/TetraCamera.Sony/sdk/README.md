# Sony Camera Remote Command / Camera Remote SDK

Folder ini tempat bahan dari Sony. Tidak di-commit ke git (lisensi Sony, repo public); hanya README ini yang dilacak (`.gitignore`). Rencana pemakaian: `docs/PLAN-SONY.md`.

Versi: **2.02.00** (Camera Remote Command dan Camera Remote SDK), didapat 5 Okt 2026 lewat pendaftaran Sony Asia Pacific (akun owner).

Isi yang diharapkan:

```
sdk/
  command/
    CameraRemoteCommand-2.02.00/
      Camera Control PTP 2 Reference.pdf      # protokol untuk model < 2020 (A7 II, A7 III)
      Camera Control PTP 3 Reference.pdf      # protokol untuk model 2020+ (A7 IV, A7 V, A7C)
      Camera Control PTP Example Instruction Manual.pdf
      README.pdf                              # tabel kompatibilitas model
      Examples/                               # contoh C++ v2/v3 (Windows WIA, Linux libusb)
  crsdk-win64/                                # Camera Remote SDK Windows 64-bit (zip dari Sony, apa adanya)
  crsdk-mac/                                  # Camera Remote SDK macOS (zip dari Sony, apa adanya)
```

Yang dipakai Tetra Booth adalah **Camera Remote Command** (protokol PTP, hanya dokumen). Camera Remote SDK disimpan sebagai referensi; SDK tidak mendukung A7 II/A7 III, dan `crsdk-win64/Driver.zip` (driver libusbK) **tidak dipasang** di laptop booth. Tidak ada file dari folder ini yang ikut build, installer, atau dikirim ke laptop booth; kode di `TetraCamera.Sony` hanya memuat nama/nilai opcode dan kode properti.

Memulihkan di mesin lain:
1. Masuk ke portal developer Sony (Camera Remote SDK / Camera Remote Command, Sony Asia Pacific) dengan akun owner.
2. Unduh Camera Remote Command dan Camera Remote SDK (Windows & macOS) versi 2.02.00, atau versi terbaru lalu catat versinya di sini dan di `docs/PLAN-SONY.md`.
3. Ekstrak paket Command ke `command/`, salin isi paket SDK ke `crsdk-win64/` dan `crsdk-mac/` seperti struktur di atas.
4. Cek `git status`: folder ini tidak boleh muncul selain README ini.
