@echo off
setlocal

cd /d "%~dp0"

set PORT=8000
set URL=http://127.0.0.1:%PORT%/index.html
set HOST=127.0.0.1

set PORT_IN_USE=
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do (
  set PORT_IN_USE=1
  goto :port_checked
)
:port_checked

if not defined PORT_IN_USE (
  where py >nul 2>nul
  if %ERRORLEVEL%==0 (
    start "s-cad server" cmd /c py -m http.server %PORT%
  ) else (
    start "s-cad server" cmd /c python -m http.server %PORT%
  )
  timeout /t 1 /nobreak >nul
) else (
  echo Port %PORT% is already in use. Assuming s-cad server is already running.
)

start "" "%URL%"

echo s-cad launch ready.
echo URL: %URL%

endlocal
