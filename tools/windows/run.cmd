@echo off
rem Jalankan Camera Service lalu booth. Dipanggil update.cmd; bisa juga dobel klik langsung.
cd /d "%~dp0"
taskkill /f /im "Tetra Booth.exe" >nul 2>&1
taskkill /f /im TetraCamera.exe >nul 2>&1
start "Tetra Camera Service" /min camera\TetraCamera.exe --port 8765 --token dev
timeout /t 2 /nobreak >nul
start "" "booth\Tetra Booth.exe"
