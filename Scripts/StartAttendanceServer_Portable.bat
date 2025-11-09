@echo off
setlocal enabledelayedexpansion

REM Student Attendance App - Portable Launcher (Windows)
REM Runs the server using a portable Node.js without requiring system npm/node.
REM Assumes the backend has already been built to dist/ and node_modules are present.

REM ===== Resolve paths =====
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set ROOT=%%~fI
set BACKEND=%ROOT%\backend
set FRONTEND=%ROOT%\frontend
set PORTABLE_DIR=%ROOT%\Portable

title Student Attendance Server (Portable)
echo [*] Preparing portable environment...

REM ===== Configuration & Argument Parsing =====
REM You can pass: -node=v20.11.1 -arch=x64
set "TARGET_NODE_VERSION=v20.11.1"
set "TARGET_NODE_ARCH=x64"
for %%A in (%*) do (
  set "ARG=%%~A"
  for /f "tokens=1,2 delims==" %%K in ("!ARG!") do (
    if /I "%%K"=="-node" set "TARGET_NODE_VERSION=%%L"
    if /I "%%K"=="--node" set "TARGET_NODE_VERSION=%%L"
    if /I "%%K"=="-arch" set "TARGET_NODE_ARCH=%%L"
    if /I "%%K"=="--arch" set "TARGET_NODE_ARCH=%%L"
  )
)
if not exist "%PORTABLE_DIR%" mkdir "%PORTABLE_DIR%" >nul 2>nul

REM Normalize version to start with v
set "VER=%TARGET_NODE_VERSION%"
if not "%VER:~0,1%"=="v" set "VER=v%VER%"
set "NODE_ZIP=node-%VER%-win-%TARGET_NODE_ARCH%.zip"
set "NODE_DIR_NAME=node-%VER%-win-%TARGET_NODE_ARCH%"
set "NODE_PORTABLE=%PORTABLE_DIR%\%NODE_DIR_NAME%"

REM ===== Download Node portable if not present =====
if not exist "%NODE_PORTABLE%\node.exe" (
  echo [*] Downloading Node.js portable %VER% (%TARGET_NODE_ARCH%)...
  set "ZIP_PATH=%TEMP%\%NODE_ZIP%"
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ErrorActionPreference='Stop'; ^
     $ver='%VER%'; $arch='%TARGET_NODE_ARCH%'; ^
     $url='https://nodejs.org/dist/'+$ver+'/node-'+$ver+'-win-'+$arch+'.zip'; ^
     Write-Host ('Downloading: '+$url); ^
     Invoke-WebRequest -Uri $url -OutFile '%ZIP_PATH%'; ^
     Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%PORTABLE_DIR%' -Force"
  if not exist "%NODE_PORTABLE%\node.exe" (
    echo [!] Failed to download/extract Node portable. Please check internet connectivity.
    pause
    exit /b 1
  )
)

REM ===== Use portable Node for this session =====
set "PATH=%NODE_PORTABLE%;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo [!] node.exe not found in portable path. Aborting.
  pause
  exit /b 1
)

REM ===== Ensure .env exists =====
if not exist "%BACKEND%\.env" (
  if exist "%BACKEND%\.env.example" (
    copy /Y "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
    echo [+] Created .env from .env.example
  ) else (
    >"%BACKEND%\.env" echo PORT=3000
    >>"%BACKEND%\.env" echo TZ=Asia/Riyadh
    >>"%BACKEND%\.env" echo ZK_IP=192.168.1.201
    >>"%BACKEND%\.env" echo ZK_PORT=4370
    >>"%BACKEND%\.env" echo ZK_MOCK=true
    >>"%BACKEND%\.env" echo ZK_PASSWORD=
    >>"%BACKEND%\.env" echo ZK_COMMKEY=
    echo [+] Created basic .env
  )
)

REM ===== Read PORT from .env =====
set PORT=
for /f "tokens=1,2 delims==" %%a in ('type "%BACKEND%\.env" ^| findstr /B /C:"PORT="') do set PORT=%%b
if not defined PORT set PORT=3000

REM ===== Validate portable run prerequisites =====
if not exist "%BACKEND%\dist\app.js" (
  echo [!] dist\app.js not found. Portable mode requires prebuilt files.
  echo     Options:
  echo     - Run Scripts\StartAttendanceServer.bat to install Node then build automatically.
  echo     - Use Docker: docker compose up --build
  echo     - Or run npm run build in backend if npm is available.
  pause
  exit /b 1
)
if not exist "%BACKEND%\node_modules" (
  echo [!] backend\node_modules not found. Portable mode requires pre-bundled dependencies.
  echo     Options:
  echo     - Use Docker which bundles deps.
  echo     - Run Scripts\StartAttendanceServer.bat (will npm install).
  echo     - Copy a prepared bundle that includes node_modules.
  pause
  exit /b 1
)

REM ===== Ensure Puppeteer Chromium is available (for PDF exports) =====
if exist "%BACKEND%\node_modules\puppeteer" (
  if not exist "%BACKEND%\node_modules\puppeteer\.local-chromium" (
    echo [*] Downloading Chromium for Puppeteer (one-time)...
    pushd "%BACKEND%" >nul
    node node_modules\puppeteer\install.js
    popd >nul
  )
)

REM ===== Start the server using portable Node =====
echo [*] Starting server (portable Node)...
start "AttendanceServerPortable" cmd /c "cd /d %BACKEND% && node dist/app.js"

REM ===== Create a desktop shortcut for portable launcher =====
set SHORTCUT=%UserProfile%\Desktop\StartAttendanceServer_Portable.lnk
if not exist "%SHORTCUT%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; ^
     $sc = $ws.CreateShortcut('%SHORTCUT%'); ^
     $sc.TargetPath = '%ROOT%\\Scripts\\StartAttendanceServer_Portable.bat'; ^
     $sc.WorkingDirectory = '%ROOT%'; ^
     $sc.WindowStyle = 1; ^
     $sc.IconLocation = '%SystemRoot%\\System32\\shell32.dll,167'; ^
     $sc.Save()"
  echo [+] Desktop shortcut created: StartAttendanceServer_Portable.lnk
)

REM ===== Open Admin UI in default browser =====
echo [*] Opening Admin UI...
start http://localhost:%PORT%/admin.html
echo [*] All set. Server is starting; if the page doesn't load immediately, wait a few seconds.
exit /b 0

