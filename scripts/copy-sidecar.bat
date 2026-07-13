@echo off
REM Copy PyInstaller output to Tauri sidecar dir, named by target triple
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
set "DEST_DIR=%ROOT%\tauri-app\src-tauri\binaries"

REM Determine platform: Windows if triple contains "windows" (case-insensitive via /I)
set "IS_WINDOWS=0"
if /I "%TARGET_TRIPLE%"=="x86_64-pc-windows-msvc"   set "IS_WINDOWS=1"
if /I "%TARGET_TRIPLE%"=="aarch64-pc-windows-msvc" set "IS_WINDOWS=1"
if /I "%TARGET_TRIPLE%"=="i686-pc-windows-msvc"    set "IS_WINDOWS=1"

if "%IS_WINDOWS%"=="1" goto :windows
goto :unix

:windows
REM PyInstaller onefile mode: moyan-backend.exe is the single self-contained binary.
REM (Previously with COLLECT mode, the exe was at dist/moyan-backend/moyan-backend.exe
REM  alongside a separate _internal/ dir. The _internal/ was not picked up by the
REM  NSIS installer, leaving the sidecar unable to find python313.DLL on the target.)
set "SRC=%ROOT%\agent-core\dist\%BIN_NAME%.exe"
set "DEST=%DEST_DIR%\%BIN_NAME%-%TARGET_TRIPLE%.exe"
goto :copy

:unix
set "SRC=%ROOT%\agent-core\dist\%BIN_NAME%"
set "DEST=%DEST_DIR%\%BIN_NAME%-%TARGET_TRIPLE%"

:copy
if not exist "%SRC%" (
    echo [ERROR] Source not found: %SRC%
    echo         Run scripts\build-backend.bat first.
    exit /b 1
)

if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
copy /Y "%SRC%" "%DEST%" >nul

REM ── Post-copy verification ──
for %%F in ("%SRC%") do set "SRC_SIZE=%%~zF"
for %%F in ("%DEST%") do set "DEST_SIZE=%%~zF"
echo Sidecar copied: %DEST%
echo   Source:      %SRC_SIZE% bytes
echo   Destination: %DEST_SIZE% bytes
if not "%SRC_SIZE%"=="%DEST_SIZE%" (
    echo   [ERROR] Size mismatch! Copy may be corrupted.
)

endlocal
