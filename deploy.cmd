@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo        RAMENG CRM - BUILD / DEPLOY / PRODUCTION SETUP
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not in PATH.
  echo Install Node.js 22 or newer and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not available.
  pause
  exit /b 1
)

echo [1/8] Installing frontend dependencies...
call npm install
if errorlevel 1 goto :fail

echo.
echo [2/8] Installing Cloudflare Worker dependencies...
pushd worker
call npm install
if errorlevel 1 (
  popd
  goto :fail
)

echo.
echo [3/8] Checking Cloudflare login...
call npx wrangler whoami >nul 2>nul
if errorlevel 1 (
  echo Cloudflare login is required. Your browser will open now.
  call npx wrangler login
  if errorlevel 1 (
    popd
    goto :fail
  )
)
popd

echo.
echo [4/8] Building CRM...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [5/8] Deploying to Cloudflare...
pushd worker
call npx wrangler deploy
if errorlevel 1 (
  popd
  goto :fail
)
popd

echo.
echo [6/8] Checking required Worker secrets...
pushd worker
set "SECRET_LIST=%TEMP%\rameng-worker-secrets.txt"
call npx wrangler secret list > "%SECRET_LIST%" 2>nul
findstr /I /C:"ADMIN_SETUP_TOKEN" "%SECRET_LIST%" >nul 2>nul
if errorlevel 1 (
  echo ADMIN_SETUP_TOKEN is not configured yet.
  echo Paste a long random token when Wrangler asks for the value.
  call npx wrangler secret put ADMIN_SETUP_TOKEN
  if errorlevel 1 (
    popd
    goto :fail
  )
) else (
  echo [OK] ADMIN_SETUP_TOKEN already exists.
  set /p UPDATE_SETUP="Update ADMIN_SETUP_TOKEN? [Y/N]: "
  if /I "%UPDATE_SETUP%"=="Y" (
    call npx wrangler secret put ADMIN_SETUP_TOKEN
    if errorlevel 1 (
      popd
      goto :fail
    )
  )
)

echo.
findstr /I /C:"SUPABASE_SECRET_KEY" "%SECRET_LIST%" >nul 2>nul
if errorlevel 1 (
  echo SUPABASE_SECRET_KEY is not configured yet.
  echo Paste the Supabase sb_secret_ key from the CLIENT project.
  echo This key stays only in Cloudflare Worker secrets.
  call npx wrangler secret put SUPABASE_SECRET_KEY
  if errorlevel 1 (
    popd
    goto :fail
  )
) else (
  echo [OK] SUPABASE_SECRET_KEY already exists.
  set /p UPDATE_SUPABASE="Update SUPABASE_SECRET_KEY? [Y/N]: "
  if /I "%UPDATE_SUPABASE%"=="Y" (
    call npx wrangler secret put SUPABASE_SECRET_KEY
    if errorlevel 1 (
      popd
      goto :fail
    )
  )
)
if exist "%SECRET_LIST%" del /q "%SECRET_LIST%" >nul 2>nul
popd

echo.
echo [7/8] Production database reminder...
echo For a NEW client Supabase project, run the complete file:
echo   supabase\setup.sql
echo in Supabase SQL Editor before using the CRM.
echo.
echo Also configure Supabase Authentication ^> URL Configuration:
echo   Site URL    = your final CRM HTTPS URL
echo   Redirect URL= your final CRM HTTPS URL/?invite=1
echo.

echo [8/8] First-run CRM configuration...
echo Open the HTTPS URL printed by Wrangler above.
echo On the first-run screen enter:
echo   - ADMIN_SETUP_TOKEN
ECHO   - Supabase Project URL
ECHO   - Supabase publishable/anon key
ECHO   - your developer email
ECHO Google can be connected later.
echo.
echo For the very first login only, create or invite your developer email
ECHO under Supabase Authentication ^> Users. After that, all normal users
ECHO are invited from the CRM itself.
echo.
echo Full checklist: PRODUCTION_SETUP.md

echo ============================================================
echo [OK] Build and deployment finished.
echo ============================================================
pause
exit /b 0

:fail
echo.
echo ============================================================
echo [ERROR] Deployment stopped because one of the commands failed.
echo Read the error above, fix it, and run deploy.cmd again.
echo ============================================================
pause
exit /b 1
