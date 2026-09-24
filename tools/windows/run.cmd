@echo off
rem Jalankan booth. Booth menjalankan Camera Service sendiri (supervisor, M3).
rem Argumen diteruskan, mis.: run.cmd --camera=simulated --demo
cd /d "%~dp0"
taskkill /f /im "Tetra Booth.exe" >nul 2>&1
taskkill /f /im TetraCamera.exe >nul 2>&1
start "" "booth\Tetra Booth.exe" %*
