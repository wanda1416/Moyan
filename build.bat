@echo off
REM Moyan one-click build script (Windows)
REM Steps:
REM   1. PyInstaller pack Python backend
REM   2. Copy sidecar to Tauri binaries
REM   3. tauri build (internally runs beforeBuildCommand = npm run build)
REM   4. Collect final artifacts into <root>/dist/

REM Use UTF-8 code page so Chinese characters in path/filename are handled correctly
chcp 65001 >nul

setlocal

set "SCRIPT_DIR=%~dp0"
set "TARGET_TRIPLE=x86_64-pc-windows-msvc"

echo === Moyan Build (Windows / %TARGET_TRIPLE%) ===

REM 1. Pack Python backend
echo(
echo [1/4] Building Python backend...
call "%SCRIPT_DIR%scripts\build-backend.bat"
if errorlevel 1 (
    echo [FAIL] Python backend build failed.
    exit /b 1
)

REM 2. Copy sidecar
echo(
echo [2/4] Copying sidecar to Tauri binaries...
call "%SCRIPT_DIR%scripts\copy-sidecar.bat" %TARGET_TRIPLE%
if errorlevel 1 (
    echo [FAIL] Sidecar copy failed.
    exit /b 1
)

REM 3. tauri build
echo(
echo [3/4] Running tauri build...
cd /d "%SCRIPT_DIR%tauri-app"
call npm run tauri build
if errorlevel 1 (
    echo [FAIL] tauri build failed.
    exit /b 1
)

REM 4. Collect final artifacts into <root>/dist/
echo(
echo [4/4] Collecting artifacts to dist\...
call "%SCRIPT_DIR%scripts\collect-artifacts.bat"
if errorlevel 1 (
    echo [WARN] Artifact collection failed (build itself succeeded).
)

echo(
echo === Moyan Build Complete ===
echo Output: %SCRIPT_DIR%dist\
endlocal
@echo off
REM Moyan one-click build script (Windows)
REM Steps:
REM   1. PyInstaller pack Python backend
REM   2. Copy sidecar to Tauri binaries
REM   3. tauri build (internally runs beforeBuildCommand = npm run build)

setlocal

set "SCRIPT_DIR=%~dp0"
set "TARGET_TRIPLE=x86_64-pc-windows-msvc"

echo === Moyan Build (Windows / %TARGET_TRIPLE%) ===

REM 1. Pack Python backend
echo.
echo [1/4] Building Python backend...
call "%SCRIPT_DIR%scripts\build-backend.bat"
if errorlevel 1 (
    echo [FAIL] Python backend build failed.
    exit /b 1
)

REM 2. Copy sidecar
echo.
echo [2/4] Copying sidecar to Tauri binaries...
call "%SCRIPT_DIR%scripts\copy-sidecar.bat" %TARGET_TRIPLE%
if errorlevel 1 (
    echo [FAIL] Sidecar copy failed.
    exit /b 1
)

REM 3. tauri build
echo.
echo [3/4] Running tauri build...
cd /d "%SCRIPT_DIR%tauri-app"
call npm run tauri build
if errorlevel 1 (
    echo [FAIL] tauri build failed.
    exit /b 1
)

REM 4. Collect final artifacts into <root>/dist/
echo.
echo [4/4] Collecting artifacts to dist\...
call "%SCRIPT_DIR%scripts\collect-artifacts.bat"
if errorlevel 1 (
    echo [WARN] Artifact collection failed (build itself succeeded).
)

echo.
echo === Moyan Build Complete ===
echo Output: %SCRIPT_DIR%dist\
endlocal