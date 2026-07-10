@echo off
REM Moyan artifact collector (Windows)
REM Copies the final build outputs from tauri target dirs to <root>/dist/
REM so the installer / portable exe is easy to find after a build.
REM
REM Detected artifact types (only those that exist are copied):
REM   Windows: nsis\*-setup.exe, msi\*.msi, raw novel-agent.exe
REM   macOS:   dmg\*.dmg, macos\*.app
REM   Linux:   deb\*.deb, rpm\*.rpm, appimage\*.AppImage
REM
REM Usage: collect-artifacts.bat
REM   Optional env override: set MOYAN_VERSION=x.y.z before running

setlocal EnableDelayedExpansion

set "SCRIPT_DIR=%~dp0"
set "ROOT=%SCRIPT_DIR%.."
set "BUNDLE_DIR=%ROOT%\tauri-app\src-tauri\target\release\bundle"
set "RELEASE_DIR=%ROOT%\tauri-app\src-tauri\target\release"
set "DIST_DIR=%ROOT%\dist"
set "CONF=%ROOT%\tauri-app\src-tauri\tauri.conf.json"

REM Auto-detect version from tauri.conf.json (env var wins)
if defined MOYAN_VERSION goto :have_version
set "MOYAN_VERSION=unknown"
if exist "%CONF%" (
    REM Use PowerShell to parse JSON (more robust than findstr on the
    REM version line, which requires careful quote-escaping inside for /f).
    powershell -NoProfile -Command ^
        "try { (Get-Content -Raw -Path '%CONF%' ^| ConvertFrom-Json).version } ^
         catch { 'unknown' }" > "%TEMP%\moyan_ver.txt" 2>nul
    if exist "%TEMP%\moyan_ver.txt" (
        for /f "usebackq delims=" %%v in ("%TEMP%\moyan_ver.txt") do (
            if not "%%v"=="" set "MOYAN_VERSION=%%v"
        )
        del "%TEMP%\moyan_ver.txt" >nul 2>&1
    )
)
:have_version

echo === Moyan Artifact Collect ===
echo Version: %MOYAN_VERSION%
echo.

REM Clean and recreate dist/ to ensure freshness
if exist "%DIST_DIR%" rmdir /s /q "%DIST_DIR%" >nul 2>&1
mkdir "%DIST_DIR%" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Failed to create %DIST_DIR%
    exit /b 1
)

set "COUNT=0"

REM Helper: copy a single file (skip if glob did not match anything)
:copy_glob
for %%f in ("%~1") do (
    if exist "%%f" (
        copy /Y "%%f" "%DIST_DIR%\" >nul
        echo   [OK] %%~nxf
        set /a COUNT+=1
    )
)
goto :eof

REM --- Windows NSIS installer ---
if exist "%BUNDLE_DIR%\nsis" (
    call :copy_glob "%BUNDLE_DIR%\nsis\*-setup.exe"
)

REM --- Windows MSI installer ---
if exist "%BUNDLE_DIR%\msi" (
    call :copy_glob "%BUNDLE_DIR%\msi\*.msi"
)

REM --- macOS DMG ---
if exist "%BUNDLE_DIR%\dmg" (
    call :copy_glob "%BUNDLE_DIR%\dmg\*.dmg"
)

REM --- macOS .app bundle (needs recursive copy) ---
if exist "%BUNDLE_DIR%\macos" (
    for /d %%d in ("%BUNDLE_DIR%\macos\*.app") do (
        if exist "%%d" (
            xcopy /E /I /Y /Q "%%d" "%DIST_DIR%\%%~nxd" >nul
            echo   [OK] %%~nxd
            set /a COUNT+=1
        )
    )
)

REM --- Linux DEB ---
if exist "%BUNDLE_DIR%\deb" (
    call :copy_glob "%BUNDLE_DIR%\deb\*.deb"
)

REM --- Linux RPM ---
if exist "%BUNDLE_DIR%\rpm" (
    call :copy_glob "%BUNDLE_DIR%\rpm\*.rpm"
)

REM --- Linux AppImage ---
if exist "%BUNDLE_DIR%\appimage" (
    call :copy_glob "%BUNDLE_DIR%\appimage\*.AppImage"
)

REM --- Raw portable binary (works without installer) ---
if exist "%RELEASE_DIR%\novel-agent.exe" (
    copy /Y "%RELEASE_DIR%\novel-agent.exe" "%DIST_DIR%\" >nul
    echo   [OK] novel-agent.exe  (portable, no installer)
    set /a COUNT+=1
)

REM --- Write build manifest ---
(
    echo # Moyan Build Manifest
    echo version: %MOYAN_VERSION%
    echo built_at: %DATE% %TIME%
    echo artifacts: !COUNT!
) > "%DIST_DIR%\MANIFEST.txt"
set /a COUNT+=1

echo.
echo === Collect Summary ===
echo Total entries: !COUNT!
echo Output:        %DIST_DIR%
echo.
dir /B "%DIST_DIR%"

endlocal
