@echo off
setlocal

cd /d "%~dp0"

set "PORT=8000"
set "URL=http://127.0.0.1:%PORT%/index.html"

echo Starting S-CAD local server...

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  set "PORT=%PORT%"
  py -3 "%~dp0local_server.py"
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  set "PORT=%PORT%"
  python "%~dp0local_server.py"
  goto :eof
)

echo Python was not found. Please install Python 3.
pause
