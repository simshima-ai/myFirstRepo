@echo off
setlocal

cd /d "%~dp0"

set "PORT=8000"
set "URL=http://localhost:%PORT%/index.html"

echo Starting S-CAD local server...

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  py -3 -m http.server %PORT%
  goto :eof
)

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "%URL%"
  python -m http.server %PORT%
  goto :eof
)

echo Python was not found. Please install Python 3.
pause

