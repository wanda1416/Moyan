@echo off
REM Moyan dev startup script (CMD)
REM Usage: dev.bat
REM Python backend is auto-managed by Tauri (PythonBridge)

setlocal

echo === Moyan Dev Environment ===

REM Check prerequisites
set "SCRIPT_DIR=%~dp0"
if exist "%SCRIPT_DIR%agent-core\.venv\Scripts\python.exe" (
    echo   Python venv found
) else (
    echo   WARNING: agent-core\.venv not found, will use system python
)

REM Start Tauri desktop app (Python backend auto-starts via PythonBridge)
echo [1/1] Starting Tauri desktop app...
echo   Python backend will be auto-managed.
cd /d "%SCRIPT_DIR%tauri-app"
call npm run tauri dev

endlocal
