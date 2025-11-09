# Student Attendance App - Build EXE (Developer Option)
# This script builds the TypeScript project and attempts to generate a Windows EXE using 'pkg'.
# It keeps the standard npm workflow intact and does NOT modify source files.

param(
  [string]$Target = "node20-win-x64",
  [string]$Output = "attendance.exe",
  [switch]$PortableFallback
)

$ErrorActionPreference = 'Stop'

function Ensure-Command($name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Command '$name' is required but not found in PATH."
  }
}

function Write-Info($msg) { Write-Host "[*] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Ok($msg) { Write-Host "[+] $msg" -ForegroundColor Green }

Write-Info "Locating backend directory"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Backend = Join-Path $Root "backend"
Set-Location $Backend

Write-Info "Checking required commands (node, npm)"
Ensure-Command node
Ensure-Command npm

Write-Info "Installing dependencies (npm ci)"
npm ci --no-audit --no-fund

Write-Info "Building TypeScript (npm run build)"
npm run build

Write-Info "Ensuring 'pkg' is available"
$pkgInstalled = (npm ls pkg --depth=0 --json | ConvertFrom-Json).dependencies.pkg -ne $null
if (-not $pkgInstalled) {
  Write-Info "Installing pkg (devDependency)"
  npm i -D pkg
}

Write-Info "Packaging EXE using pkg"
$BuildDir = Join-Path $Backend "build"
if (-not (Test-Path $BuildDir)) { New-Item -ItemType Directory -Path $BuildDir | Out-Null }
$ExePath = Join-Path $BuildDir $Output

# Attempt to package. Note: Native modules like 'sqlite3' may require special handling.
try {
  npx pkg dist/app.js --targets $Target --output $ExePath --compress Brotli
  Write-Ok "EXE generated: $ExePath"
} catch {
  Write-Warn "pkg packaging failed: $($_.Exception.Message)"
  Write-Warn "Native modules (e.g., sqlite3) and Puppeteer may need extra configuration when using pkg."
  if ($PortableFallback) {
    Write-Info "Preparing portable bundle instead (Node portable + dist + node_modules)"
    $PortableDir = Join-Path $BuildDir "portable"
    if (-not (Test-Path $PortableDir)) { New-Item -ItemType Directory -Path $PortableDir | Out-Null }

    # Copy dist, assets, reports structure
    Copy-Item (Join-Path $Backend 'dist') -Destination $PortableDir -Recurse -Force
    Copy-Item (Join-Path $Backend 'assets') -Destination $PortableDir -Recurse -Force
    if (-not (Test-Path (Join-Path $PortableDir 'reports'))) { New-Item -ItemType Directory -Path (Join-Path $PortableDir 'reports') | Out-Null }
    if (-not (Test-Path (Join-Path $PortableDir 'reports/saved'))) { New-Item -ItemType Directory -Path (Join-Path $PortableDir 'reports/saved') | Out-Null }

    # Copy node_modules (runtime deps)
    Copy-Item (Join-Path $Backend 'node_modules') -Destination $PortableDir -Recurse -Force

    # Download Node portable (to be used by end-user)
    $arch = "x64"
    if ($Env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { $arch = 'arm64' }
    $ver = 'v20.11.1'
    $zipName = "node-$ver-win-$arch.zip"
    $zipPath = Join-Path $env:TEMP $zipName
    $url = "https://nodejs.org/dist/$ver/$zipName"
    Write-Info "Downloading Node portable: $url"
    Invoke-WebRequest -Uri $url -OutFile $zipPath
    Expand-Archive -Path $zipPath -DestinationPath $PortableDir -Force

    # Create Start-Portable.bat inside portable bundle
    $nodeFolder = "node-$ver-win-$arch"
    $startBat = @"
@echo off
setlocal
set SCRIPT_DIR=%~dp0
set APPDIR=%SCRIPT_DIR%
set PATH=%APPDIR%$nodeFolder;%PATH%
echo Starting app with portable Node...
node dist\app.js
"@
    $startBatPath = Join-Path $PortableDir 'Start-Portable.bat'
    Set-Content -Path $startBatPath -Value $startBat -Encoding ASCII

    Write-Ok "Portable bundle prepared: $PortableDir"
    Write-Info "End-user can run Start-Portable.bat without installing npm/node"
  }
}

Write-Info "Copying runtime assets next to EXE (if created)"
if (Test-Path $ExePath) {
  $ExeDir = Split-Path $ExePath -Parent
  Copy-Item (Join-Path $Backend 'assets') -Destination $ExeDir -Recurse -Force
  if (-not (Test-Path (Join-Path $ExeDir 'reports'))) { New-Item -ItemType Directory -Path (Join-Path $ExeDir 'reports') | Out-Null }
  if (-not (Test-Path (Join-Path $ExeDir 'reports/saved'))) { New-Item -ItemType Directory -Path (Join-Path $ExeDir 'reports/saved') | Out-Null }
  Write-Ok "Assets placed next to EXE"
  Write-Warn "If Puppeteer is used, ensure Chromium is available or set PUPPETEER_EXECUTABLE_PATH."
}

Write-Info "Done."

