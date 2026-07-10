@echo off
REM Moyan frontend build script (Windows)
REM Runs npm run build in tauri-app/, output to tauri-app/dist/

setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "APP_DIR=%ROOT%\tauri-app"

echo === Moyan Frontend Build (Windows) ===

if not exist "%APP_DIR%\package.json" (
    echo [ERROR] %APP_DIR%\package.json not found.
    exit /b 1
)

cd /d "%APP_DIR%"
call npm run build
if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    exit /b 1
)

echo.
echo === Done ===
echo Frontend built: %APP_DIR%\dist\
endlocal