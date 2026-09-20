@echo off
setlocal
cd /d "%~dp0"

echo [RAMeng] Preparing local development...

if not exist "worker\.dev.vars" (
  copy /Y "worker\.dev.vars.example" "worker\.dev.vars" >nul
  echo.
  echo [RAMeng] Created worker\.dev.vars from the example.
  echo Fill in SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY
  echo and optionally DEVELOPER_EMAILS, then save the file.
  start "" notepad "worker\.dev.vars"
  echo.
  echo Re-run start-dev.cmd after saving the values.
  exit /b 1
)

if not exist "node_modules" (
  echo [RAMeng] Installing frontend dependencies...
  call npm install
  if errorlevel 1 exit /b 1
)

if not exist "worker\node_modules" (
  echo [RAMeng] Installing Worker dependencies...
  call npm --prefix worker install
  if errorlevel 1 exit /b 1
)

echo [RAMeng] Starting Cloudflare Worker on localhost:8787...
start "RAMeng Worker" /D "%~dp0" cmd /k "npm --prefix worker run dev"

timeout /t 2 /nobreak >nul

echo [RAMeng] Starting Vite...
call npm run dev
