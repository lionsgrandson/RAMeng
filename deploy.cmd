@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================================
echo              RAMENG CRM - BUILD AND DEPLOY
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

echo [1/7] Installing frontend dependencies...
call npm install
if errorlevel 1 goto :fail

echo.
echo [2/7] Installing Cloudflare Worker dependencies...
pushd worker
call npm install
if errorlevel 1 (
  popd
  goto :fail
)

echo.
echo [3/7] Checking Cloudflare login...
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
echo [4/7] Building CRM...
call npm run build
if errorlevel 1 goto :fail

echo.
echo [5/7] Deploying to Cloudflare...
pushd worker
call npx wrangler deploy
if errorlevel 1 (
  popd
  goto :fail
)
popd

echo.
echo [6/7] Initial setup secret
set /p ADD_SECRET="Do you want to set/update ADMIN_SETUP_TOKEN now? [Y/N]: "
if /I "%ADD_SECRET%"=="Y" (
  pushd worker
  echo Paste a long random setup token when Wrangler asks for the secret value.
  call npx wrangler secret put ADMIN_SETUP_TOKEN
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
)

echo.
echo [7/7] Supabase server secret for CRM user invitations
set /p ADD_SUPABASE_SECRET="Do you want to set/update SUPABASE_SECRET_KEY now? [Y/N]: "
if /I "%ADD_SUPABASE_SECRET%"=="Y" (
  pushd worker
  echo Paste the Supabase secret key from Project Settings ^> API Keys.
  echo Use the sb_secret_ key, or the legacy service_role key if your project still uses it.
  call npx wrangler secret put SUPABASE_SECRET_KEY
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
)

echo.
echo ============================================================
echo [OK] Deployment finished.
echo Open the workers.dev URL printed above.
echo For first setup, enter ADMIN_SETUP_TOKEN, Supabase URL,
echo Supabase anon/publishable key and the developer email in the setup screen.
echo SUPABASE_SECRET_KEY must be configured before inviting users from the CRM.
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
