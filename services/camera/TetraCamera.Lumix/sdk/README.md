# Lumix Remote Control Library

Folder ini tempat `Lmxptpif.dll` dari paket Panasonic **LumixRemoteControlLibraryBeta1.00** (folder `Library/`).
Tidak di-commit ke git (lisensi Panasonic). Dokumen API, header, dan contoh ada di paket itu (tidak disalin ke repo).

```
sdk/
  Lmxptpif.dll   (Windows x64; butuh Visual C++ 2015–2022 runtime x64)
```

Semua `*.dll` di folder ini otomatis disalin ke output build `TetraCamera.Lumix`. Booth Windows mengunduh DLL
sendiri dari R2 privat ke `<folder data>/lumix` (DECISIONS #112, #214):
`pnpm --filter web edsdk:upload <folder berisi Lmxptpif.dll> <versi> lumix`.
