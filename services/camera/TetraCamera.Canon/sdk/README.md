# Canon EDSDK

Folder ini tempat file EDSDK dari Canon Developer Program. Tidak di-commit ke git (lisensi Canon).

Isi yang diharapkan setelah unduh (Windows 64-bit):

```
sdk/
  EDSDK.dll
  EdsImage.dll
  ... (DLL lain dari paket EDSDK/Windows/EDSDK_64)
```

Semua `*.dll` di folder ini otomatis disalin ke output build `TetraCamera.Canon`.
Wrapper C# untuk EDSDK ditulis di Fase 1 (lihat docs/03-TSD.md §2.1).
