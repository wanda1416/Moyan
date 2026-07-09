@echo off
setlocal EnableDelayedExpansion

echo === Moyan Dev Environment ===

:: Script directory
set "SCRIPT_DIR=%~dp0"

:: 1. Start Python backend
echo [1/2] Starting Python backend...
cd /d "%SCRIPT_DIR%agent-core"
if exist ".venv\Scripts\python.exe" (
    start /b .venv\Scripts\python.exe main.py
) else (
    echo   venv not found, falling back to system python
    start /b python main.py
)
cd /d "%SCRIPT_DIR%"

:: Wait for backend
echo   Waiting for backend...
set "READY=0"
for /l %%i in (1,1,10) do (
    if !READY! equ 0 (
        timeout /t 1 /nobreak >nul
        curl -sf http://127.0.0.1:8765/health >nul 2>&1
        if !errorlevel! equ 0 (
            set "READY=1"
            echo   Python backend ready (http://127.0.0.1:8765)
        )
    )
)
if !READY! equ 0 echo   Backend still starting, please wait...

:: 2. Start Tauri desktop app
echo [2/2] Starting Tauri desktop app...
cd /d "%SCRIPT_DIR%tauri-app"
call npm run tauri dev

:: Cleanup
echo.
echo Shutting down Python backend...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8765" ^| findstr "LISTENING"') do (
    taskkill /f /pid %%a >nul 2>&1
)
echo Done.

endlocal
