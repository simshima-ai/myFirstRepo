@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "TARGET_BRANCH=web-only-deploy"
set "REMOTE_NAME=origin"
set "COMMIT_MSG=%~1"

for /f "delims=" %%I in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%I"
if not defined CURRENT_BRANCH (
  echo Failed to detect the current git branch.
  pause
  exit /b 1
)

if /I not "%CURRENT_BRANCH%"=="%TARGET_BRANCH%" (
  echo Current branch is "%CURRENT_BRANCH%".
  echo Switch to "%TARGET_BRANCH%" before running this script.
  pause
  exit /b 1
)

git diff --quiet --ignore-submodules HEAD --
if %errorlevel%==0 (
  git ls-files --others --exclude-standard | findstr . >nul
  if errorlevel 1 (
    echo No changes to deploy.
    pause
    exit /b 0
  )
)

if not defined COMMIT_MSG (
  set /p "COMMIT_MSG=Commit message for simplecad.work deploy: "
)

if not defined COMMIT_MSG (
  echo Commit message is required.
  pause
  exit /b 1
)

echo.
echo Staging changes...
git add -A
if errorlevel 1 goto :git_failed

echo Creating commit...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 goto :git_failed

echo Pushing to %REMOTE_NAME%/%TARGET_BRANCH%...
git push %REMOTE_NAME% %TARGET_BRANCH%
if errorlevel 1 goto :git_failed

echo.
echo simplecad.work deployment branch updated successfully.
pause
exit /b 0

:git_failed
echo.
echo Deployment failed. Review the git output above.
pause
exit /b 1
