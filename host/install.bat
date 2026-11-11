@echo off
setlocal
cd /d "%~dp0"
echo === 1-Click Video Downloader setup ===
echo.

echo [1/3] yt-dlp install/update hocche...
python -m pip install -U "yt-dlp[default]"
if errorlevel 1 (
  echo Python/pip paoa jayni. python.org theke Python install kore abar run korun.
  pause & exit /b 1
)

echo.
echo [2/3] ffmpeg check (HD video + audio merge er jonno)...
where ffmpeg >nul 2>nul
if errorlevel 1 (
  if exist "%LOCALAPPDATA%\Microsoft\WinGet\Links\ffmpeg.exe" (
    echo ffmpeg ache.
  ) else (
    echo ffmpeg nei - winget diye install korchi...
    winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
  )
) else (
  echo ffmpeg ache.
)

echo.
echo [3/3] Chrome er sathe helper register korchi...
set "MANIFEST=%~dp0com.ali.videodl.json"
set "HOSTBAT=%~dp0host.bat"
set "HOSTBAT_JSON=%HOSTBAT:\=\\%"
(
  echo {
  echo   "name": "com.ali.videodl",
  echo   "description": "1-Click Video Downloader helper",
  echo   "path": "%HOSTBAT_JSON%",
  echo   "type": "stdio",
  echo   "allowed_origins": ["chrome-extension://bnigbcnffognlhjcgllhndbaebbphmle/"]
  echo }
) > "%MANIFEST%"
reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ali.videodl" /ve /t REG_SZ /d "%MANIFEST%" /f >nul

echo.
echo Setup shesh! Ekhon Chrome e extension folder ta Load unpacked korun (README dekhun).
echo Video save hobe: %USERPROFILE%\Downloads\Videos
pause
