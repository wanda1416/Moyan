@echo off
REM Moyan artifact collector (Windows)
REM Copies build outputs from tauri target to <root>/dist/
REM NOTE: Avoids "for" loops and EnableDelayedExpansion to ensure
REM       compatibility with non-ASCII filenames (e.g. Chinese characters).

setlocal

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "BUNDLE_DIR=%ROOT%\tauri-app\src-tauri\target\release\bundle"
set "DIST_DIR=%ROOT%\dist"

echo === Moyan Artifact Collect ===
echo.

REM Clean and recreate dist/
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%" >nul 2>&1
mkdir "%DIST_DIR%" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to create %DIST_DIR%
    exit /b 1
)

REM --- NSIS installer (*.exe) ---
if exist "%BUNDLE_DIR%\nsis" copy /Y "%BUNDLE_DIR%\nsis\*-setup.exe" "%DIST_DIR%\" >nul 2>&1

REM --- MSI installer (*.msi) ---
if exist "%BUNDLE_DIR%\msi" copy /Y "%BUNDLE_DIR%\msi\*.msi" "%DIST_DIR%\" >nul 2>&1

REM --- macOS DMG (*.dmg) ---
if exist "%BUNDLE_DIR%\dmg" copy /Y "%BUNDLE_DIR%\dmg\*.dmg" "%DIST_DIR%\" >nul 2>&1

REM --- Linux DEB (*.deb) ---
if exist "%BUNDLE_DIR%\deb" copy /Y "%BUNDLE_DIR%\deb\*.deb" "%DIST_DIR%\" >nul 2>&1

REM --- Linux RPM (*.rpm) ---
if exist "%BUNDLE_DIR%\rpm" copy /Y "%BUNDLE_DIR%\rpm\*.rpm" "%DIST_DIR%\" >nul 2>&1

REM --- Linux AppImage (*.AppImage) ---
if exist "%BUNDLE_DIR%\appimage" copy /Y "%BUNDLE_DIR%\appimage\*.AppImage" "%DIST_DIR%\" >nul 2>&1

echo === Collect Summary ===
echo Output: %DIST_DIR%
echo.
dir /B "%DIST_DIR%" 2>nul

endlocal
