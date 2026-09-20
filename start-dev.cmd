@echo off
setlocal
cd /d "%~dp0"

echo [RAMeng] Preparing local development...

if not exist "worker\.dev.vars" (
  copy /Y "worker\.dev.vars.example" "worker\.dev.vars" >nul
  goto :configure
)

findstr /B /C:"SUPABASE_URL=" "worker\.dev.vars" >nul || goto :configure
findstr /B /C:"SUPABASE_ANON_KEY=" "worker\.dev.vars" >nul || goto :configure
findstr /B /C:"SUPABASE_SECRET_KEY=" "worker\.dev.vars" >nul || goto :configure
findstr /C:"your-project.supabase.co" "worker\.dev.vars" >nul && goto :configure
findstr /C:"sb_publishable_replace_me" "worker\.dev.vars" >nul && goto :configure
findstr /C:"sb_secret_replace_me" "worker\.dev.vars" >nul && goto :configure

goto :install

:configure
echo.
echo [RAMeng] worker\.dev.vars needs your Supabase values.
echo Required:
echo   SUPABASE_URL
echo   SUPABASE_ANON_KEY
echo   SUPABASE_SECRET_KEY
echo Optional:
echo   DEVELOPER_EMAILS
echo.
start "" notepad "worker\.dev.vars"
echo Save the file, then run start-dev.cmd again.
exit /b 1

:install
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
