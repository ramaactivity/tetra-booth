@echo off
rem Tetra Booth dev updater. Taruh file ini di folder mana pun (mis. C:\TetraBooth), dobel klik.
rem Unduh build terbaru dari R2, ekstrak ke folder app\, lalu jalankan. Hanya butuh curl + tar bawaan Windows 10/11.
setlocal
set "URL=__MEDIA_URL__/dev-builds/tetra-booth-dev.zip"
cd /d "%~dp0"
taskkill /f /im "Tetra Booth.exe" >nul 2>&1
taskkill /f /im TetraCamera.exe >nul 2>&1
echo Mengunduh build terbaru...
curl -L -# -o tetra-booth-dev.zip "%URL%?t=%RANDOM%%RANDOM%" || (echo GAGAL mengunduh. Cek internet. & pause & exit /b 1)
if exist app rmdir /s /q app
mkdir app
tar -xf tetra-booth-dev.zip -C app || (echo GAGAL mengekstrak. & pause & exit /b 1)
del tetra-booth-dev.zip
set /p BUILD=<app\VERSION.txt
echo Build: %BUILD%
start "" app\run.cmd
