# Moyan dev startup script (PowerShell)
# Usage: .\dev.ps1
# Python backend is auto-managed by Tauri (PythonBridge)

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host '=== Moyan Dev Environment ===' -ForegroundColor Cyan

# Check prerequisites
$venvPy = Join-Path $ScriptDir 'agent-core\.venv\Scripts\python.exe'
if (Test-Path $venvPy) {
    Write-Host '  Python venv found' -ForegroundColor Green
} else {
    Write-Host '  WARNING: agent-core\.venv not found, will use system python' -ForegroundColor Yellow
}

# Start Tauri desktop app (Python backend auto-starts via PythonBridge)
Write-Host '[1/1] Starting Tauri desktop app...' -ForegroundColor Yellow
Write-Host '  Python backend will be auto-managed.' -ForegroundColor Gray
$tauriDir = Join-Path $ScriptDir 'tauri-app'
Set-Location $tauriDir
npm run tauri dev
