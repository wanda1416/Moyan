@echo off
REM Copy PyInstaller onedir output to Tauri resources dir
REM Usage: copy-sidecar.bat ^<target-triple^>
REM Example:
REM   copy-sidecar.bat x86_64-pc-windows-msvc

setlocal

if "%~1"=="" (
    echo Usage: %~nx0 ^<target-triple^>
    echo   e.g. x86_64-pc-windows-msvc, aarch64-apple-darwin
    exit /b 1
)

set "TARGET_TRIPLE=%~1"
set "BIN_NAME=moyan-backend"
set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "SRC_DIR=%ROOT%\agent-core\dist\%BIN_NAME%"
set "DEST_DIR=%ROOT%\tauri-app\src-tauri\binaries\%BIN_NAME%"

REM Determine platform: Windows if triple contains "windows" (case-insensitive via /I)
set "IS_WINDOWS=0"
if /I "%TARGET_TRIPLE%"=="x86_64-pc-windows-msvc"   set "IS_WINDOWS=1"
if /I "%TARGET_TRIPLE%"=="aarch64-pc-windows-msvc" set "IS_WINDOWS=1"
if /I "%TARGET_TRIPLE%"=="i686-pc-windows-msvc"    set "IS_WINDOWS=1"

if "%IS_WINDOWS%"=="1" goto :windows
goto :unix

:windows
if not exist "%SRC_DIR%\%BIN_NAME%.exe" (
    echo [ERROR] Source not found: %SRC_DIR%\%BIN_NAME%.exe
    echo         Run scripts\build-backend.bat first.
    exit /b 1
)
goto :copy

:unix
if not exist "%SRC_DIR%\%BIN_NAME%" (
    echo [ERROR] Source not found: %SRC_DIR%\%BIN_NAME%
    echo         Run scripts\build-backend.bat first.
    exit /b 1
)

:copy
REM Remove old destination directory
if exist "%DEST_DIR%" rmdir /s /q "%DEST_DIR%"

REM Copy entire onedir output (exe + _internal/)
xcopy /E /I /Q /Y "%SRC_DIR%" "%DEST_DIR%" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy sidecar directory.
    exit /b 1
)

REM ── Post-copy verification ──
echo Sidecar copied: %DEST_DIR%
if "%IS_WINDOWS%"=="1" (
    for %%F in ("%DEST_DIR%\%BIN_NAME%.exe") do echo   Exe size: %%~zF bytes
)
REM Count files in destination
set "FILE_COUNT=0"
for /R "%DEST_DIR%" %%F in (*) do set /a FILE_COUNT+=1
echo   Total files: %FILE_COUNT%

endlocal
