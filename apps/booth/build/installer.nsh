; Tetra Booth: penyesuaian installer NSIS electron-builder (DECISIONS #90).

; Update: uninstaller versi lama boleh gagal (0.5.3 keluar dengan kode 2 saat memindah file ke folder
; sementara). Jangan hentikan pemasangan; file versi baru langsung ditimpa di folder yang sama.
!macro customUnInstallCheck
  ${if} $R0 != 0
    DetailPrint "Uninstall versi lama gagal (kode $R0), file ditimpa versi baru"
  ${endif}
  ClearErrors
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro customUnInstallCheck
!macroend

; Uninstaller versi ini: hapus folder aplikasi langsung (tanpa memindah file satu per satu).
; Data booth di %APPDATA%\TetraBooth tidak disentuh.
!macro customRemoveFiles
  SetOutPath $TEMP
  RMDir /r $INSTDIR
!macroend
