@echo off
setlocal enabledelayedexpansion

REM Student Attendance App - Server Launcher (Windows)
REM Creates a desktop shortcut with a school building icon and starts backend server.

REM Resolve root directory (this script is in Scripts\)
set SCRIPT_DIR=%~dp0
for %%I in ("%SCRIPT_DIR%..") do set ROOT=%%~fI
set BACKEND=%ROOT%\backend
set FRONTEND=%ROOT%\frontend

title Student Attendance Server
echo [*] Preparing environment...

REM ===== Configuration & Argument Parsing =====
REM You can pass: -node=v20.11.1 -arch=x64
set "TARGET_NODE_VERSION="
set "TARGET_NODE_ARCH="
for %%A in (%*) do (
  set "ARG=%%~A"
  for /f "tokens=1,2 delims==" %%K in ("!ARG!") do (
    if /I "%%K"=="-node" set "TARGET_NODE_VERSION=%%L"
    if /I "%%K"=="--node" set "TARGET_NODE_VERSION=%%L"
    if /I "%%K"=="-arch" set "TARGET_NODE_ARCH=%%L"
    if /I "%%K"=="--arch" set "TARGET_NODE_ARCH=%%L"
  )
)
if not defined TARGET_NODE_ARCH (
  set "TARGET_NODE_ARCH=x64"
  if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "TARGET_NODE_ARCH=arm64"
  if defined PROCESSOR_ARCHITEW6432 (
    if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "TARGET_NODE_ARCH=arm64"
  )
)

REM Check Node.js (auto-install if missing)
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js غير مثبت. سأحاول تثبيته تلقائياً (يتطلب صلاحيات المسؤول)...
  call :InstallNodeLTS
  REM Try to refresh PATH for current session
  set "NODE_DIR=%ProgramFiles%\nodejs"
  if exist "%NODE_DIR%\node.exe" set "PATH=%NODE_DIR%;%PATH%"
  where node >nul 2>nul
  if errorlevel 1 (
    echo [!] فشل تثبيت Node.js تلقائياً. رجاءً ثبته يدوياً من https://nodejs.org/en/download
    pause
    exit /b 1
  )
)

REM Verify npm exists
where npm >nul 2>nul
if errorlevel 1 (
  echo [*] لم يتم العثور على npm في PATH. محاولة التهيئة...
  set "NODE_DIR=%ProgramFiles%\nodejs"
  if exist "%NODE_DIR%\npm.cmd" set "PATH=%NODE_DIR%;%PATH%"
  where npm >nul 2>nul
  if errorlevel 1 (
    echo [!] npm غير متاح بعد التثبيت. أعد فتح النافذة أو سجّل الخروج/الدخول لتحديث PATH.
    echo     إن استمرت المشكلة، ثبّت Node.js LTS يدوياً.
    pause
    exit /b 1
  )
)

REM Ensure .env exists
if not exist "%BACKEND%\.env" (
  if exist "%BACKEND%\.env.example" (
    copy /Y "%BACKEND%\.env.example" "%BACKEND%\.env" >nul
    echo [+] Created .env from .env.example
    echo PDF_ENGINE=pdfkit>>"%BACKEND%\.env"
  ) else (
    echo [!] .env.example not found under backend. Creating a basic .env...
    >"%BACKEND%\.env" echo PORT=3000
    >>"%BACKEND%\.env" echo TZ=Asia/Riyadh
    >>"%BACKEND%\.env" echo ZK_IP=192.168.1.201
    >>"%BACKEND%\.env" echo ZK_PORT=4370
    >>"%BACKEND%\.env" echo ZK_MOCK=true
    >>"%BACKEND%\.env" echo ZK_PASSWORD=
    >>"%BACKEND%\.env" echo ZK_COMMKEY=
    >>"%BACKEND%\.env" echo PDF_ENGINE=pdfkit
  )
)

REM Install dependencies (backend)
echo [*] Installing backend dependencies (if needed)...
pushd "%BACKEND%" >nul
set PUPPETEER_SKIP_DOWNLOAD=1
npm install --no-audit --no-fund
if errorlevel 1 (
  echo [!] npm install failed. Please check your internet connection or proxy settings.
  popd >nul
  pause
  exit /b 1
)
popd >nul

REM Detect PORT from .env (fallback to 3000)
set PORT=
for /f "tokens=1,2 delims==" %%a in ('type "%BACKEND%\.env" ^| findstr /B /C:"PORT="') do set PORT=%%b
if not defined PORT set PORT=3000
REM Detect if port is busy
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set PID_IN_USE=%%P
if defined PID_IN_USE (
  echo [!] Port %PORT% is in use by PID %PID_IN_USE%.
  echo     If this is a previous server instance, close it or change PORT in backend\.env.
)

REM (Server start moved below to use computed PORT)

REM Create a desktop shortcut with a school building icon (shell32.dll resource)
set SHORTCUT=%UserProfile%\Desktop\StartAttendanceServer.lnk
if not exist "%SHORTCUT%" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$ws = New-Object -ComObject WScript.Shell; ^
     $sc = $ws.CreateShortcut('%SHORTCUT%'); ^
     $sc.TargetPath = '%ROOT%\\Scripts\\StartAttendanceServer.bat'; ^
     $sc.WorkingDirectory = '%ROOT%'; ^
     $sc.WindowStyle = 1; ^
     $sc.IconLocation = '%SystemRoot%\\System32\\shell32.dll,167'; ^
     $sc.Save()"
  echo [+] Desktop shortcut created: StartAttendanceServer.lnk
)

REM If port is busy, switch to next port automatically for this session
for /f "tokens=5" %%P in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set PID_IN_USE=%%P
if defined PID_IN_USE (
  echo [!] Port %PORT% is in use by PID %PID_IN_USE%. Switching to next port...
  set /a PORT=%PORT%+1
)

REM Start the server in a new window with session PORT
echo [*] Starting server on PORT %PORT%...
start "AttendanceServer" cmd /c "set PORT=%PORT% && cd /d %BACKEND% && npm run dev"

REM Open home page in default browser (index.html) after a short delay
echo [*] Opening Home page...
timeout /t 2 /nobreak >nul
start http://localhost:%PORT%/index.html
echo [*] All set. Server is starting; if the page doesn't load immediately, wait a few seconds.
exit /b 0

:InstallNodeLTS
REM حاول استخدام winget أولاً
where winget >nul 2>nul
if not errorlevel 1 (
  if defined TARGET_NODE_VERSION (
    setlocal enabledelayedexpansion
    set "_VER=%TARGET_NODE_VERSION%"
    if "!_VER:~0,1!"=="v" set "_VER=!_VER:~1!"
    echo [*] تثبيت Node.js LTS الإصدار !_VER! عبر winget...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "Start-Process -FilePath 'winget' -ArgumentList ('install -e --id OpenJS.NodeJS.LTS --version ' + '!_VER!' + ' --silent --accept-package-agreements --accept-source-agreements') -Verb RunAs -Wait"
    endlocal
  ) else (
    echo [*] تثبيت Node.js LTS عبر winget...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "Start-Process -FilePath 'winget' -ArgumentList 'install -e --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements' -Verb RunAs -Wait"
  )
  goto :EOF
)
REM جرّب Chocolatey
where choco >nul 2>nul
if not errorlevel 1 (
  if defined TARGET_NODE_VERSION (
    setlocal enabledelayedexpansion
    set "_VER=%TARGET_NODE_VERSION%"
    if "!_VER:~0,1!"=="v" set "_VER=!_VER:~1!"
    echo [*] تثبيت Node.js LTS الإصدار !_VER! عبر Chocolatey...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "Start-Process -FilePath 'choco' -ArgumentList ('install nodejs-lts -y --version ' + '!_VER!') -Verb RunAs -Wait"
    endlocal
  ) else (
    echo [*] تثبيت Node.js LTS عبر Chocolatey...
    powershell -NoProfile -ExecutionPolicy Bypass -Command ^
      "Start-Process -FilePath 'choco' -ArgumentList 'install nodejs-lts -y' -Verb RunAs -Wait"
  )
  goto :EOF
)
REM خطة بديلة: تنزيل LTS/نسخة محددة من nodejs.org وتثبيته بصمت عبر MSI
set "NODE_MSI=%TEMP%\nodejs_lts.msi"
echo [*] تنزيل Node.js MSI من nodejs.org ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; ^
   $arch = '%TARGET_NODE_ARCH%'; ^
   if ([string]::IsNullOrWhiteSpace('%TARGET_NODE_VERSION%')) { ^
     $index = Invoke-RestMethod 'https://nodejs.org/dist/index.json'; ^
     $lts = $index | Where-Object { $_.lts } | Select-Object -First 1; ^
     $ver = $lts.version; ^
   } else { ^
     $ver = '%TARGET_NODE_VERSION%'; ^
     if ($ver -like 'v*') { $ver = $ver.Substring(1); } ^
     $ver = 'v' + $ver; ^
   } ^
   $url = 'https://nodejs.org/dist/' + $ver + '/node-' + $ver + '-' + $arch + '.msi'; ^
   Write-Host ('تنزيل: ' + $url); ^
   Invoke-WebRequest -Uri $url -OutFile '%NODE_MSI%'"
if exist "%NODE_MSI%" (
  echo [*] تثبيت Node.js بصمت...
  msiexec /i "%NODE_MSI%" /qn /norestart
  del /q "%NODE_MSI%" >nul 2>nul
) else (
  echo [!] فشل تنزيل MSI.
)
goto :EOF
