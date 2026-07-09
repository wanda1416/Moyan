# Moyan dev startup script (PowerShell)
# Usage: .\dev.ps1

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '=== Moyan Dev Environment ===' -ForegroundColor Cyan

# Cleanup
$script:pythonProcess = $null
function Cleanup {
    Write-Host ''
    Write-Host 'Shutting down Python backend...' -ForegroundColor Yellow
    if ($script:pythonProcess -and -not $script:pythonProcess.HasExited) {
        Stop-Process -Id $script:pythonProcess.Id -Force -ErrorAction SilentlyContinue
    }
    Write-Host 'Done.' -ForegroundColor Green
}

# 1. Start Python backend
Write-Host '[1/2] Starting Python backend...' -ForegroundColor Yellow
$pyDir = Join-Path $ScriptDir 'agent-core'
$venvPy = Join-Path $pyDir '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
    Write-Host '  venv not found, falling back to system python' -ForegroundColor Yellow
    $venvPy = 'python'
}
$script:pythonProcess = Start-Process -FilePath $venvPy -ArgumentList @('main.py') -WorkingDirectory $pyDir -PassThru -NoNewWindow

# Wait for backend
Write-Host '  Waiting for backend...' -ForegroundColor Yellow
$ready = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    try {
        $null = Invoke-WebRequest -Uri 'http://127.0.0.1:8765/health' -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        Write-Host '  Python backend ready (http://127.0.0.1:8765)' -ForegroundColor Green
        $ready = $true
        break
    } catch {}
}
if (-not $ready) {
    Write-Host '  Backend still starting, please wait...' -ForegroundColor Yellow
}

# 2. Start Tauri desktop app
Write-Host '[2/2] Starting Tauri desktop app...' -ForegroundColor Yellow
$tauriDir = Join-Path $ScriptDir 'tauri-app'
Set-Location $tauriDir
try {
    npm run tauri dev
} finally {
    Cleanup
}
