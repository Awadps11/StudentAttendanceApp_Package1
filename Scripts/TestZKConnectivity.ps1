param(
  [string]$Ip = $(if ($env:ZK_IP) { $env:ZK_IP } else { '192.168.1.201' }),
  [int]$Port = $(if ($env:ZK_PORT) { [int]$env:ZK_PORT } else { 4370 })
)

$ErrorActionPreference = 'Stop'

Write-Host "== ZK Connectivity Test ==" -ForegroundColor Cyan
Write-Host "IP: $Ip  Port: $Port" -ForegroundColor Cyan

function Write-Section($title) {
  Write-Host "`n--- $title ---" -ForegroundColor Yellow
}

function Append-Log($text) {
  try {
    $root = Split-Path -Parent $PSScriptRoot
    $logFile = Join-Path $root 'backend' 'zk_test_log.txt'
    $timestamp = (Get-Date).ToString('s')
    Add-Content -LiteralPath $logFile -Value ("[$timestamp] " + $text)
  } catch {}
}

Write-Section 'Ping'
try {
  $ping = Test-Connection -ComputerName $Ip -Count 1 -ErrorAction Stop
  $latency = [math]::Round(($ping | Select-Object -ExpandProperty ResponseTime | Measure-Object -Average).Average, 0)
  Write-Host "Ping OK ($latency ms)" -ForegroundColor Green
  Append-Log "Ping OK ($latency ms) to $Ip"
} catch {
  Write-Host "Ping failed: $($_.Exception.Message)" -ForegroundColor Red
  Append-Log "Ping failed: $($_.Exception.Message) to $Ip"
}

Write-Section 'TCP Port'
try {
  $tnc = Test-NetConnection -ComputerName $Ip -Port $Port -WarningAction SilentlyContinue
  if ($tnc.TcpTestSucceeded) {
    Write-Host "TCP connect OK" -ForegroundColor Green
    Append-Log "TCP connect OK to $Ip:$Port"
  } else {
    Write-Host "TCP connect failed. RemoteAddress=$($tnc.RemoteAddress) PingSucceeded=$($tnc.PingSucceeded)" -ForegroundColor Red
    Append-Log "TCP connect failed. PingSucceeded=$($tnc.PingSucceeded) RemoteAddress=$($tnc.RemoteAddress)"
  }
} catch {
  Write-Host "Test-NetConnection error: $($_.Exception.Message)" -ForegroundColor Red
  Append-Log "Test-NetConnection error: $($_.Exception.Message)"
}

Write-Section 'Hint'
Write-Host "If TCP failed: check firewall rules, device port 4370, CommKey." -ForegroundColor DarkYellow
Write-Host "You can also call GET /api/zk/diagnose from the backend for detailed attempts." -ForegroundColor DarkYellow

Write-Host "`nDone." -ForegroundColor Cyan
